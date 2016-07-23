var util = require('util');
var crc = require('crc');
var nukiConstants = require('./nuki-constants');
var _ = require('underscore');
var sodium = require('sodium');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function UserSpecificDataInputOutputCharacteristic(keys, config) {
    UserSpecificDataInputOutputCharacteristic.super_.call(this, {
        // uuid: 'a92ee202-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee202550111e4916c0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2902',   // client characterstic configuration
                value: 'set a value'
            })
        ]
    });
    this.keys = keys;
    this.config = config;
    this.dataStillToSend = new Buffer(0);
}

util.inherits(UserSpecificDataInputOutputCharacteristic, BlenoCharacteristic);

UserSpecificDataInputOutputCharacteristic.prototype.sendStatus = function (status) {
    if (this._updateValueCallback) {
        var wCmdBuf = new Buffer(3);
        wCmdBuf.writeUInt16LE(nukiConstants.CMD_STATUS, 0);
        wCmdBuf.writeUInt8(status, 2);
        var checksum = crc.crc16ccitt(wCmdBuf);
        var checksumBuffer = new Buffer(2);
        checksumBuffer.writeUInt16LE(checksum);
        var value = Buffer.concat([wCmdBuf, checksumBuffer]);
        this._updateValueCallback(value);
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.sendError = function (status, cmdId) {
    if (this._updateValueCallback) {
        var wCmdBuf = new Buffer(5);
        wCmdBuf.writeUInt16LE(nukiConstants.CMD_ERROR, 0);
        wCmdBuf.writeUInt8(status, 2);
        wCmdBuf.writeUInt16LE(cmdId, 3);
        var checksum = crc.crc16ccitt(wCmdBuf);
        var checksumBuffer = new Buffer(2);
        checksumBuffer.writeUInt16LE(checksum);
        var value = Buffer.concat([wCmdBuf, checksumBuffer]);
        console.log("STATUS ERROR", value);
        this._updateValueCallback(value);
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.prepareEncryptedDataToSend = function (cmd, authorizationId, nonce, sharedSecret, payload) {

    var authIdBuffer = new Buffer(4);
    authIdBuffer.writeUInt32LE(authorizationId);
    var cmdBuffer = new Buffer(2);
    cmdBuffer.writeUInt16LE(cmd);

    var pDataWithoutCrc = Buffer.concat([authIdBuffer, cmdBuffer, payload]);
    var checksum = crc.crc16ccitt(pDataWithoutCrc);
    var checksumBuffer = new Buffer(2);
    checksumBuffer.writeUInt16LE(checksum);
    var pData = Buffer.concat([pDataWithoutCrc, checksumBuffer]);

    var pDataEncrypted = sodium.api.crypto_secretbox(pData, nonce, sharedSecret).slice(16); // skip first 16 bytes
    // console.log("encrypted message: ", pDataEncrypted);

    var lenBuffer = new Buffer(2);
    lenBuffer.writeUInt16LE(pDataEncrypted.length);

    var aData = Buffer.concat([nonce, authIdBuffer, lenBuffer]);

    // console.log("aData: ", aData);
    // console.log("pData: ", pData);

    this.dataStillToSend = Buffer.concat([aData, pDataEncrypted]);
    // console.log("prepared to send:", this.dataStillToSend, this.dataStillToSend.length);
};

UserSpecificDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    var nonce, d, currentTimeBuffer, timezoneOffset, value, pin, savedPin;
    // console.log("UserSpecificDataInputOutputCharacteristic write:", data);
    function simulateCalibration() {
        var self = this;
        self.sendStatus(nukiConstants.STATUS_ACCEPTED);
        setTimeout(function () {
            self.config.set("lockState", 1); // locked
            console.log("locked");
            self.sendStatus(nukiConstants.STATUS_ACCEPTED);
            self.config.save(function (err) {
                if (err) {
                    console.log("Writing configuration failed", err);
                    self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                } else {
                    setTimeout(function () {
                        self.config.set("lockState", 2); // unlocking
                        console.log("unlocking");
                        self.sendStatus(nukiConstants.STATUS_ACCEPTED);
                        self.config.save(function (err) {
                            if (err) {
                                console.log("Writing configuration failed", err);
                                self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                            } else {
                                setTimeout(function () {
                                    self.config.set("lockState", 3); // unlocked
                                    console.log("unlocked");
                                    self.sendStatus(nukiConstants.STATUS_ACCEPTED);
                                    self.config.save(function (err) {
                                        if (err) {
                                            console.log("Writing configuration failed", err);
                                            self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                                        } else {
                                            setTimeout(function () {
                                                self.config.set("lockState", 5); // unlatched
                                                console.log("unlatched");
                                                self.sendStatus(nukiConstants.STATUS_ACCEPTED);
                                                self.config.save(function (err) {
                                                    if (err) {
                                                        console.log("Writing configuration failed", err);
                                                        self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                                                    } else {
                                                        setTimeout(function () {
                                                            self.config.set("lockState", 1); // locked
                                                            console.log("locked");
                                                            self.sendStatus(nukiConstants.STATUS_COMPLETE);
                                                            self.config.save(function (err) {
                                                                if (err) {
                                                                    console.log("Writing configuration failed", err);
                                                                    self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                                                                }
                                                            });
                                                        }, 2000);
                                                    }
                                                });
                                            }, 1000);
                                        }
                                    });
                                }, 1000);
                            }
                        });
                    }, 500);
                }
            });
        }, 1000);
    }

    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG);
    } else if (data.length > 200) {
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    } else {
        var nonceABF = data.slice(0, 24);
        var authorizationId = data.readUInt32LE(24);
        var messageLen = data.readUInt16LE(28);
        var encryptedMessage = data.slice(30);

        var users = this.config.get("users");
        if (users) {

            var user = users[authorizationId];
            // user object contains:
            //  authorizationId: newAuthorizationId,
            //  name: name,
            //  appId: appId,
            //  appType: appType,
            //  sharedSecret: this.keys.sharedSecret.toString('hex')

            if (user.sharedSecret) {
                var sharedSecret = new Buffer(user.sharedSecret, 'hex');


                var prefixBuff = new Buffer(16);
                prefixBuff.fill(0);

                var decryptedMessge = sodium.api.crypto_secretbox_open(Buffer.concat([prefixBuff, encryptedMessage]), nonceABF, sharedSecret);
                console.log("decrypted message: ", decryptedMessge);

                if (nukiConstants.crcOk(decryptedMessge)) {
                    // console.log("CRC ok");
                    var authorizationIdFromEncryptedMessage = decryptedMessge.readUInt32LE(0);
                    // console.log("authorization-id: " + authorizationIdFromEncryptedMessage);
                    var cmdId = decryptedMessge.readUInt16LE(4);
                    var cmdIdBuf = decryptedMessge.slice(4, 4 + 2);
                    console.log("command id: 0x" + cmdIdBuf.toString('hex'));
                    var payload = decryptedMessge.slice(6, decryptedMessge.length - 2);
                    console.log("payload", payload);

                    switch (cmdId) {
                        case nukiConstants.CMD_REQUEST_DATA:
                            console.log("CL sent CMD_REQUEST_DATA");
                            var dataId = payload.readUInt16LE(0);
                            switch (dataId) {
                                case nukiConstants.CMD_CHALLENGE:
                                    console.log("CL requests challenge");
                                    this.nonceK = new Buffer(nukiConstants.NUKI_NONCEBYTES);
                                    sodium.api.randombytes_buf(this.nonceK);
                                    console.log("NEW nonceK", this.nonceK);

                                    this.prepareEncryptedDataToSend(nukiConstants.CMD_CHALLENGE, authorizationId, nonceABF, sharedSecret, this.nonceK);
                                    while (this.dataStillToSend.length > 0) {
                                        value = this.getNextChunk(this.dataStillToSend);
                                        if (this._updateValueCallback && value.length > 0) {
                                            // console.log("SL sending challenge...", value, value.length);
                                            this._updateValueCallback(value);
                                        }
                                    }

                                    break;
                                case nukiConstants.CMD_NUKI_STATES:
                                    console.log("CL sent CMD_NUKI_STATES");

                                    var nukiState = new Buffer(1);
                                    nukiState.writeUInt8(this.config.get("nukiState"));

                                    var lockState = new Buffer(1);
                                    lockState.writeUInt8(this.config.get("lockState") || 0);

                                    var trigger = new Buffer(1);
                                    trigger.writeUInt8(0);  // bluetooth

                                    d = new Date();
                                    currentTimeBuffer = new Buffer(7);
                                    currentTimeBuffer.writeUInt16LE(d.getFullYear(), 0);
                                    currentTimeBuffer.writeUInt8(d.getMonth() + 1, 2);
                                    currentTimeBuffer.writeUInt8(d.getDate(), 3);
                                    currentTimeBuffer.writeUInt8(d.getHours(), 4);
                                    currentTimeBuffer.writeUInt8(d.getMinutes(), 5);
                                    currentTimeBuffer.writeUInt8(d.getSeconds(), 6);

                                    timezoneOffset = new Buffer(2);
                                    timezoneOffset.writeInt16LE(d.getTimezoneOffset());

                                    var nukiStates = Buffer.concat([nukiState, lockState, trigger, currentTimeBuffer, timezoneOffset]);
                                    this.prepareEncryptedDataToSend(nukiConstants.CMD_NUKI_STATES, authorizationId, nonceABF, sharedSecret, nukiStates);
                                    while (this.dataStillToSend.length > 0) {
                                        value = this.getNextChunk(this.dataStillToSend);
                                        if (this._updateValueCallback && value.length > 0) {
                                            // console.log("SL sending config data...", value, value.length);
                                            this._updateValueCallback(value);
                                        }
                                    }

                                    break;
                                default:
                                    console.log("CL requests " + dataId);
                            }
                            break;
                        case nukiConstants.CMD_SET_CONFIG:
                            console.log("CL sent CMD_SET_CONFIG");
                            var setName = payload.slice(0, 32);
                            var setLatitude = payload.readFloatLE(32);
                            var setLongitude = payload.readFloatLE(36);
                            var setAutoUnlatch = payload.readUInt8(40);
                            var setPairingEnabled = payload.readUInt8(41);
                            var setButtonEnabled = payload.readUInt8(42);
                            var setLedFlashEnabled = payload.readUInt8(43);
                            var setLedBrightness = payload.readUInt8(44);
                            var setTimezoneOffset = payload.readInt16LE(45);
                            var setDstMode = payload.readUInt8(47);
                            var setFobAction1 = payload.readUInt8(48);
                            var setFobAction2 = payload.readUInt8(49);
                            var setFobAction3 = payload.readUInt8(50);
                            nonce = payload.slice(51, 51 + 32);
                            var setPin = payload.readUInt16LE(51 + 32);

                            if (Buffer.compare(this.nonceK, nonce) === 0) {
                                console.log("nonce verified ok");

                                this.config.set("name", setName.toString().trim());
                                this.config.set("latitude", setLatitude);
                                this.config.set("longitude", setLongitude);
                                this.config.set("autoUnlatch", setAutoUnlatch);
                                this.config.set("pairingEnabled", setPairingEnabled);
                                this.config.set("buttonEnabled", setButtonEnabled);
                                this.config.set("ledFlashEnabled", setLedFlashEnabled);
                                this.config.set("ledBrightness", setLedBrightness);
                                this.config.set("timezoneOffset", setTimezoneOffset);
                                this.config.set("dstMode", setDstMode);
                                this.config.set("fobAction1", setFobAction1);
                                this.config.set("fobAction2", setFobAction2);
                                this.config.set("fobAction3", setFobAction3);
                                this.config.set("adminPin", setPin);
                                var self = this;
                                this.config.save(function (err) {
                                    if (err) {
                                        console.log("Writing configuration failed", err);
                                        self.sendError(nukiConstants.ERROR_UNKNOWN, cmdId);
                                    } else {
                                        console.log("Configuration saved");
                                        self.sendStatus(nukiConstants.STATUS_COMPLETE);
                                    }
                                });
                            } else {
                                console.log("ERROR: nonce differ");
                                console.log("nonceK", this.nonceK);
                                console.log("nonceABF", nonceABF);
                                this.sendError(nukiConstants.K_ERROR_BAD_NONCE, cmdId);
                            }

                            break;
                        case nukiConstants.CMD_REQUEST_CONFIG:
                            console.log("CL sent CMD_REQUEST_CONFIG");
                            nonce = payload;
                            console.log("Nonce", nonce, nonce.length);

                            var nukiIdStr = this.config.get('nukiId');
                            var nukiId = new Buffer(nukiIdStr, 'hex');
                            var nameStr = this.config.get("name");
                            if (!nameStr) {
                                nameStr = 'Nuki_' + nukiIdStr;
                            }
                            var nameBuffer = new Buffer(32).fill(' ');
                            var name = new Buffer(nameStr);
                            if (name.length > nameBuffer.length) {
                                name.copy(nameBuffer, 0, 0, nameBuffer.length);
                            } else {
                                name.copy(nameBuffer, 0, 0, name.length);
                            }
                            var latitude = this.config.get("latitude") || 0;
                            var longitude = this.config.get("longitude") || 0;
                            var latBuffer = new Buffer(4);
                            latBuffer.writeFloatLE(latitude);
                            var longitudeBuffer = new Buffer(4);
                            longitudeBuffer.writeFloatLE(longitude);

                            var autoUnlatch = new Buffer(1);
                            autoUnlatch.writeUInt8(this.config.get("autoUnlatch") || 0);
                            var pairingEnabled = new Buffer(1);
                            pairingEnabled.writeUInt8(this.config.get("pairingEnabled") === null ? 1 : this.config.get("pairingEnabled"));
                            var buttonEnabled = new Buffer(1);
                            buttonEnabled.writeUInt8(this.config.get("buttonEnabled") === null ? 1 : this.config.get("buttonEnabled"));
                            var ledEnabled = new Buffer(1);
                            ledEnabled.writeUInt8(this.config.get("ledEnabled") === null ? 1 : this.config.get("ledEnabled"));
                            var ledBrightness = new Buffer(1);
                            ledBrightness.writeUInt8(this.config.get("ledBrightness") === null ? 3 : this.config.get("ledBrightness"));

                            d = new Date();
                            currentTimeBuffer = new Buffer(7);
                            currentTimeBuffer.writeUInt16LE(d.getFullYear(), 0);
                            currentTimeBuffer.writeUInt8(d.getMonth() + 1, 2);
                            currentTimeBuffer.writeUInt8(d.getDate(), 3);
                            currentTimeBuffer.writeUInt8(d.getHours(), 4);
                            currentTimeBuffer.writeUInt8(d.getMinutes(), 5);
                            currentTimeBuffer.writeUInt8(d.getSeconds(), 6);

                            timezoneOffset = new Buffer(2);
                            timezoneOffset.writeInt16LE(d.getTimezoneOffset());

                            var dstMode = new Buffer(1);
                            dstMode.writeUInt8(this.config.get("dstMode") === null ? 1 : this.config.get("dstMode"));  // 0x01 european

                            var hasFob = new Buffer(1);
                            hasFob.writeUInt8(1);

                            var fobAction1 = new Buffer(1);
                            fobAction1.writeUInt8(this.config.get("fobAction1") === null ? 1 : this.config.get("fobAction1"));   // unlock
                            var fobAction2 = new Buffer(1);
                            fobAction2.writeUInt8(this.config.get("fobAction2") === null ? 2 : this.config.get("fobAction2"));   // lock
                            var fobAction3 = new Buffer(1);
                            fobAction3.writeUInt8(this.config.get("fobAction3") || 0);   // nothing

                            var configData = Buffer.concat([nukiId, nameBuffer, latBuffer, longitudeBuffer, autoUnlatch,
                                pairingEnabled, buttonEnabled, ledEnabled, ledBrightness, currentTimeBuffer,
                                timezoneOffset, dstMode, hasFob, fobAction1, fobAction3, fobAction3]);
                            this.prepareEncryptedDataToSend(nukiConstants.CMD_CONFIG, authorizationId, nonceABF, sharedSecret, configData);
                            while (this.dataStillToSend.length > 0) {
                                value = this.getNextChunk(this.dataStillToSend);
                                if (this._updateValueCallback && value.length > 0) {
                                    this._updateValueCallback(value);
                                }
                            }
                            break;
                        case nukiConstants.CMD_REQUEST_CALIBRATION:
                            console.log("CL sent CMD_REQUEST_CALIBRATION");
                            nonceABF = payload.slice(0, 32);
                            if (Buffer.compare(this.nonceK, nonceABF) === 0) {
                                console.log("nonce verified ok");
                                pin = payload.readUInt16LE(32);
                                console.log("PIN ", pin);
                                savedPin = this.config.get("adminPin");
                                if (savedPin) {
                                    if (savedPin === pin) {
                                        console.log("PIN verified ok");
                                        simulateCalibration.call(this);
                                    } else {
                                        console.log("ERROR: pin not ok. Saved: " + savedPin + ", given: " + pin);
                                        this.sendError(nukiConstants.K_ERROR_BAD_PIN, cmdId);
                                    }
                                } else {
                                    console.log("Calibrating");
                                    simulateCalibration.call(this);
                                }
                            } else {
                                console.log("ERROR: nonce differ");
                                console.log("nonceK", this.nonceK);
                                console.log("nonceABF", nonceABF);
                                this.sendError(nukiConstants.K_ERROR_BAD_NONCE, cmdId);
                            }
                            break;
                        case nukiConstants.CMD_VERIFY_PIN:
                            console.log("CL sent CMD_VERIFY_PIN");
                            nonceABF = payload.slice(0, 32);
                            if (Buffer.compare(this.nonceK, nonceABF) === 0) {

                                pin = payload.readUInt16LE(32);
                                console.log("PIN ", pin);
                                savedPin = this.config.get("adminPin");
                                if (savedPin) {
                                    if (savedPin === pin) {
                                        console.log("PIN verified ok");
                                        this.sendStatus(nukiConstants.STATUS_COMPLETE);
                                    } else {
                                        console.log("ERROR: pin not ok. Saved: " + savedPin + ", given: " + pin);
                                        this.sendError(nukiConstants.K_ERROR_BAD_PIN, cmdId);
                                    }
                                } else {
                                    this.sendStatus(nukiConstants.STATUS_COMPLETE);
                                }
                            } else {
                                console.log("ERROR: nonce differ");
                                console.log("nonceK", this.nonceK);
                                console.log("nonceABF", nonceABF);
                                this.sendError(nukiConstants.K_ERROR_BAD_NONCE, cmdId);
                            }
                            break;
                        case nukiConstants.CMD_UPDATE_TIME:
                            console.log("CL sent CMD_UPDATE_TIME");
                            this.sendStatus(nukiConstants.STATUS_COMPLETE);
                            break;
                        case nukiConstants.CMD_AUTHORIZATION_DATA_INVITE:
                            console.log("CL sent CMD_AUTHORIZATION_DATA_INVITE");

                            // todo

                            this.sendStatus(nukiConstants.STATUS_COMPLETE);
                    }
                    callback(this.RESULT_SUCCESS);
                } else {
                    console.log("ERROR: crc not ok");
                    callback(this.RESULT_UNLIKELY_ERROR);
                }
            } else {
                console.log("ERROR: don't have sharedSecret in config for authorization-id " + authorizationId);
                callback(this.RESULT_UNLIKELY_ERROR);
            }
        } else {
            console.log("WARNING: don't have users stored in config");
            callback(this.RESULT_UNLIKELY_ERROR);
        }
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.onReadRequest = function (offset, callback) {
    console.log("UserSpecificDataInputOutputCharacteristic GET requested", offset);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG, null);
    }
    else {
        var data = new Buffer(2);
        data.writeUInt16BE(1, 0);
        callback(this.RESULT_SUCCESS, data);
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.onSubscribe = function (maxValueSize, updateValueCallback) {
    console.log('UserSpecificDataInputOutputCharacteristic - onSubscribe');

    this._updateValueCallback = updateValueCallback;

    if (this.dataStillToSend.length > 0) {
        while (this.dataStillToSend.length > 0) {
            var value = this.getNextChunk(this.dataStillToSend);
            if (value.length > 0) {
                console.log("sending " + value.length + " bytes from onSubscribe");
                updateValueCallback(value);
            }
        }
    } else {
        console.log("don't have more data to notify");
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.onUnsubscribe = function () {
    console.log('UserSpecificDataInputOutputCharacteristic - onUnsubscribe');

    this._updateValueCallback = null;
};

UserSpecificDataInputOutputCharacteristic.prototype.getNextChunk = function (data) {
    var block0;
    if (data.length > 20) {
        block0 = data.slice(0, 20);
        this.dataStillToSend = data.slice(20);
    } else {
        block0 = data;
        this.dataStillToSend = new Buffer(0);
    }
    return block0;
};


module.exports = UserSpecificDataInputOutputCharacteristic;
