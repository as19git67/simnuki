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
    console.log("encrypted message: ", pDataEncrypted);

    var lenBuffer = new Buffer(2);
    lenBuffer.writeUInt16LE(pDataEncrypted.length);

    var aData = Buffer.concat([nonce, authIdBuffer, lenBuffer]);

    console.log("aData: ", aData);
    console.log("pData: ", pData);
    // console.log("pDataEncrypted: ", pDataEncrypted);

    this.dataStillToSend = Buffer.concat([aData, pDataEncrypted]);
    // console.log("prepared to send:", this.dataStillToSend, this.dataStillToSend.length);
};

UserSpecificDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    console.log("UserSpecificDataInputOutputCharacteristic write:", data);
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
                    console.log("CRC ok");
                    var authorizationIdFromEncryptedMessage = decryptedMessge.readUInt32LE(0);
                    console.log("authorization-id: " + authorizationIdFromEncryptedMessage);
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
                                    var nonceK = new Buffer(nukiConstants.NUKI_NONCEBYTES);
                                    sodium.api.randombytes_buf(nonceK);
                                    console.log("nonceK", nonceK);

                                    this.prepareEncryptedDataToSend(nukiConstants.CMD_CHALLENGE, authorizationId, nonceABF, sharedSecret, nonceK);
                                    while (this.dataStillToSend.length > 0) {
                                        value = this.getNextChunk(this.dataStillToSend);
                                        if (this._updateValueCallback && value.length > 0) {
                                            // console.log("SL sending challenge...", value, value.length);
                                            this._updateValueCallback(value);
                                        }
                                    }

                                    break;
                                default:
                                    console.log("CL requests " + dataId);
                            }
                            break;
                        case nukiConstants.REQUEST_CONFIG:
                            console.log("CL requests config");
                            var nonce = payload;
                            console.log("Nonce", nonce, nonce.length);

                            var nukiIdStr = this.config.get('nukiId');
                            var nukiId = new Buffer(nukiIdStr, 'hex');
                            var nameStr = 'Nuki_' + nukiIdStr;

                            var nameBuffer = new Buffer(32).fill(' ');
                            var name = new Buffer(nameStr);
                            if (name.length > nameBuffer.length) {
                                name.copy(nameBuffer, 0, 0, nameBuffer.length);
                            } else {
                                name.copy(nameBuffer, 0, 0, name.length);
                            }
                            var latitude = 48.2454575;
                            var longitude = 10.981113917;
                            var latBuffer = new Buffer(4);
                            latBuffer.writeFloatLE(latitude);
                            var longitudeBuffer = new Buffer(4);
                            longitudeBuffer.writeFloatLE(longitude);

                            var autoUnlatch = new Buffer(1);
                            autoUnlatch.writeUInt8(0);
                            var pairingEnabled = new Buffer(1);
                            pairingEnabled.writeUInt8(1);
                            var buttonEnabled = new Buffer(1);
                            buttonEnabled.writeUInt8(1);
                            var ledEnabled = new Buffer(1);
                            ledEnabled.writeUInt8(1);
                            var ledBrightness = new Buffer(1);
                            ledBrightness.writeUInt8(3);

                            var d = new Date();
                            var currentTimeBuffer = new Buffer(7);
                            currentTimeBuffer.writeUInt16LE(d.getFullYear(), 0);
                            currentTimeBuffer.writeUInt8(d.getMonth() + 1, 2);
                            currentTimeBuffer.writeUInt8(d.getDate(), 3);
                            currentTimeBuffer.writeUInt8(d.getHours(), 4);
                            currentTimeBuffer.writeUInt8(d.getMinutes(), 5);
                            currentTimeBuffer.writeUInt8(d.getSeconds(), 6);

                            var timezoneOffset = new Buffer(2);
                            timezoneOffset.writeInt16LE(d.getTimezoneOffset());

                            var dstMode = new Buffer(1);
                            dstMode.writeUInt8(1);  // 0x01 european

                            var hasFob = new Buffer(1);
                            hasFob.writeUInt8(0);

                            var fobAction1 = new Buffer(1);
                            fobAction1.writeUInt8(1);   // unlock
                            var fobAction2 = new Buffer(1);
                            fobAction2.writeUInt8(2);   // lock
                            var fobAction3 = new Buffer(1);
                            fobAction3.writeUInt8(0);   // nothing

                            var configData = Buffer.concat([nukiId, nameBuffer, latBuffer, longitudeBuffer, autoUnlatch,
                                pairingEnabled, buttonEnabled, ledEnabled, ledBrightness, currentTimeBuffer,
                                timezoneOffset, dstMode, hasFob, fobAction1, fobAction3, fobAction3]);
                            this.prepareEncryptedDataToSend(nukiConstants.CONFIG, authorizationId, nonceABF, sharedSecret, configData);
                            while (this.dataStillToSend.length > 0) {
                                value = this.getNextChunk(this.dataStillToSend);
                                if (this._updateValueCallback && value.length > 0) {
                                    console.log("SL sending config data...", value, value.length);
                                    this._updateValueCallback(value);
                                }
                            }


                            break;
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
