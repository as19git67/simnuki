var util = require('util');
var nukiConstants = require('./nuki-constants');
var _ = require('underscore');
var crc = require('crc');
var sodium = require('sodium');
var HSalsa20 = require('./hsalsa20');
var crypto = require('crypto');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function PairingGeneralDataInputOutputCharacteristic(keys) {
    this.state = this.PAIRING_IDLE;
    this.keys = keys;
    this.dataStillToSend = new Buffer(0);

    PairingGeneralDataInputOutputCharacteristic.super_.call(this, {
        // uuid: 'a92ee101-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee101550111e4916c0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2902',   // client characterstic configuration
                value: 'Pairing commands'
            })
        ]
    });
}

util.inherits(PairingGeneralDataInputOutputCharacteristic, BlenoCharacteristic);

PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_IDLE = 0;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY = 1;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY = 2;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE = 3;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHENTICATOR = 4;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE_2 = 5;
PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHORIZATION_DATA = 6;


PairingGeneralDataInputOutputCharacteristic.prototype.getNextChunk = function (data) {
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

PairingGeneralDataInputOutputCharacteristic.prototype.prepareDataToSend = function (cmd, data) {
    var cmdBuffer = new Buffer(2);
    cmdBuffer.writeUInt16LE(cmd);
    var responseData = Buffer.concat([cmdBuffer, data]);
    var checksum = crc.crc16ccitt(responseData);
    var checksumBuffer = new Buffer(2);
    checksumBuffer.writeUInt16LE(checksum);
    this.dataStillToSend = Buffer.concat([responseData, checksumBuffer]);
    console.log("prepared to send:", this.dataStillToSend);
};

PairingGeneralDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    var cmdId, slPk, value, clCr;
    console.log("PairingGeneralDataInputOutputCharacteristic", data);
    var dataForCrc = data.slice(0, data.length - 2);
    var crcSumCalc = crc.crc16ccitt(dataForCrc);
    var crcSumRetrieved = data.readUInt16LE(data.length - 2);

    if (crcSumCalc === crcSumRetrieved) {
        console.log("checksum is ok");
        if (offset) {
            callback(this.RESULT_ATTR_NOT_LONG);
        } else if (data.length > 200) {
            callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
        } else {
            switch (this.state) {
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_IDLE:
                    var rCmd = data.readUInt16LE(0);
                    cmdId = data.readUInt16LE(2);
                    if (rCmd === nukiConstants.CMD_reqUEST_DATA && cmdId === nukiConstants.CMD_ID_PUBLIC_KEY) {
                        slPk = new Buffer(0);
                        if (Buffer.isBuffer(this.keys.slPk)) {
                            slPk = this.keys.slPk;
                        } else {
                            if (_.isString(this.keys.slPk)) {
                                slPk = new Buffer(this.keys.slPk, 'hex');
                            } else {
                                if (_.isArray(this.keys.slPk)) {
                                    slPk = new Buffer(this.keys.slPk);
                                }
                            }
                        }

                        if (slPk.length > 0) {
                            this.prepareDataToSend(nukiConstants.CMD_ID_PUBLIC_KEY, slPk);
                            this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY;

                            callback(this.RESULT_SUCCESS);
                        } else {
                            console.log("ERROR missing SL public key");
                            this.state = this.PAIRING_IDLE;
                            callback(this.RESULT_UNLIKELY_ERROR);
                        }
                    }
                    else {
                        console.log("command or command identifier wrong");
                        this.state = this.PAIRING_IDLE;
                        callback(this.RESULT_UNLIKELY_ERROR);
                    }
                    break;
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY:
                    cmdId = data.readUInt16LE(0);
                    if (cmdId === nukiConstants.CMD_ID_PUBLIC_KEY) {
                        this.keys.clPk = data.slice(2, data.length - 2);
                        console.log("CL PUBKEY:", this.keys.clPk);

                        slPk = new Buffer(0);
                        if (Buffer.isBuffer(this.keys.slPk)) {
                            slPk = this.keys.slPk;
                        } else {
                            if (_.isString(this.keys.slPk)) {
                                slPk = new Buffer(this.keys.slPk, 'hex');
                            } else {
                                if (_.isArray(this.keys.slPk)) {
                                    slPk = new Buffer(this.keys.slPk);
                                }
                            }
                        }
                        var slSk = new Buffer(0);
                        if (Buffer.isBuffer(this.keys.slSk)) {
                            slSk = this.keys.slSk;
                        } else {
                            if (_.isString(this.keys.slSk)) {
                                slSk = new Buffer(this.keys.slSk, 'hex');
                            } else {
                                if (_.isArray(this.keys.slSk)) {
                                    slSk = new Buffer(this.keys.slSk);
                                }
                            }
                        }

                        this.keys.slPk = slPk;
                        this.keys.slSk = slSk;

                        console.log("slPK", slPk);
                        console.log("slSK", slSk);
                        console.log("clPK", this.keys.clPk);

                        // Create Diffie-Hellman key from nuki secret key and clients public key
                        // crypto_scalarmult_curve25519(k,secretKey,pk)
                        var k = sodium.api.crypto_scalarmult(slSk, this.keys.clPk);
                        console.log("SL DH Key from SL SK and CL PK: ", k);

                        // derive a longterm shared secret key s from k using function kdf1
                        // static const unsigned char _0[16];
                        // static const unsigned char sigma[16] = "expand 32-byte k";
                        // crypto_core_hsalsa20(firstKey,_0,sharedKey,sigma)
                        var hsalsa20 = new HSalsa20();
                        this.keys.sharedSecret = new Buffer(32);
                        var inv = new Buffer(16);
                        inv.fill(0);
                        var c = new Buffer("expand 32-byte k");
                        hsalsa20.crypto_core(this.keys.sharedSecret, inv, k, c);
                        console.log("derived shared key: ", this.keys.sharedSecret);


                        console.log("Creating one time challenge...");
                        this.keys.sc = new Buffer(nukiConstants.NUKI_NONCEBYTES);
                        sodium.api.randombytes_buf(this.keys.sc);

                        // this.keys.sc = new Buffer("6CD4163D159050C798553EAA57E278A579AFFCBC56F09FC57FE879E51C42DF17", 'hex');

                        if (this.keys.sc.length != nukiConstants.NUKI_NONCEBYTES) {
                            console.log("Nonce length (" + this.keys.sc.length + ") is not " + nukiConstants.NUKI_NONCEBYTES);
                            this.state = this.PAIRING_IDLE;
                            callback(this.RESULT_UNLIKELY_ERROR);
                            return;
                        }

                        this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE;
                        this.prepareDataToSend(nukiConstants.CMD_CHALLENGE, this.keys.sc);
                        value = this.getNextChunk(this.dataStillToSend);
                        if (this._updateValueCallback && value.length > 0) {
                            console.log("sending challenge 1: " + value.length + " bytes");
                            this._updateValueCallback(value);
                        }


                        var r = Buffer.concat([this.keys.clPk, slPk, this.keys.sc]);
                        // use HMAC-SHA256 to create the authenticator
                        var a = crypto.createHmac('SHA256', this.keys.sharedSecret).update(r).digest();
                        console.log("SL Authorization authenticator", a);

                        callback(this.RESULT_SUCCESS);
                    }
                    else {
                        console.log("command or command identifier wrong");
                        this.state = this.PAIRING_IDLE;
                        callback(this.RESULT_UNLIKELY_ERROR);
                    }

                    break;
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHENTICATOR:
                    cmdId = data.readUInt16LE(0);
                    if (cmdId === nukiConstants.CMD_AUTHORIZATION_AUTHENTICATOR) {
                        clCr = data.slice(2, data.length - 2);
                        console.log("CL authorization authenticator", clCr);

                        // create authenticator with data from server side

                        r = Buffer.concat([this.keys.slPk, this.keys.clPk, this.keys.sc]);
                        // use HMAC-SHA256 to create the authenticator
                        var cr = crypto.createHmac('SHA256', this.keys.sharedSecret).update(r).digest();
                        console.log("SL Authorization authenticator", cr);

                        // Step 14: verify authenticator
                        if (Buffer.compare(clCr, cr) === 0) {
                            console.log("Authenticators verified ok");

                            this.keys.cr = cr;

                            // Step 15: send second challenge
                            console.log("Creating second one time challenge...");
                            this.keys.sc = new Buffer(nukiConstants.NUKI_NONCEBYTES);
                            sodium.api.randombytes_buf(this.keys.sc);
                            // this.keys.sc = new Buffer("E0742CFEA39CB46109385BF91286A3C02F40EE86B0B62FC34033094DE41E2C0D", 'hex');
                            // if (this.keys.sc.length != nukiConstants.NUKI_NONCEBYTES) {
                            //     console.log("Nonce length (" + this.keys.sc.length + ") is not " + nukiConstants.NUKI_NONCEBYTES);
                            //     this.state = this.PAIRING_IDLE;
                            //     callback(this.RESULT_UNLIKELY_ERROR);
                            //     return;
                            // }
                            this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE_2;
                            this.prepareDataToSend(nukiConstants.CMD_CHALLENGE, this.keys.sc);
                            value = this.getNextChunk(this.dataStillToSend);
                            if (this._updateValueCallback && value.length > 0) {
                                console.log("sending challenge 2: " + value.length + " bytes");
                                this._updateValueCallback(value);
                            }

                            callback(this.RESULT_SUCCESS);
                        } else {
                            console.log("CL and SL authenticators are not equal. Possible man in the middle attack. Exiting.");
                            this.state = this.PAIRING_IDLE;
                            callback(this.RESULT_UNLIKELY_ERROR);
                        }
                    } else {
                        console.log("command or command identifier wrong");
                        this.state = this.PAIRING_IDLE;
                        callback(this.RESULT_UNLIKELY_ERROR);
                    }
                    break;
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHORIZATION_DATA:
                    cmdId = data.readUInt16LE(0);
                    if (cmdId === nukiConstants.CMD_AUTHORIZATION_DATA) {
                        // Step 16: client sent authorization data
                        var clAuthData = data.slice(2, data.length - 2);
                        console.log("CL sent authorization data", clAuthData, clAuthData.length);

                        clCr = data.slice(0, 32);
                        if (Buffer.compare(clCr, this.keys.cr) === 0) {
                            console.log("Authenticator verified ok");

                            // todo store new user and generate new authorization-id
                            // todo send new authorization-id

                            // todo continue with state machine
                            callback(this.RESULT_SUCCESS);
                        } else {
                            console.log("CL and SL authenticators are not equal. Possible man in the middle attack. Exiting.");
                            this.state = this.PAIRING_IDLE;
                            callback(this.RESULT_UNLIKELY_ERROR);
                        }
                    } else {
                        console.log("command or command identifier wrong");
                        this.state = this.PAIRING_IDLE;
                        callback(this.RESULT_UNLIKELY_ERROR);
                    }
                    break;
                default:
                    console.log("ERROR unexpected pairing state");
                    this.state = this.PAIRING_IDLE;
                    callback(this.RESULT_UNLIKELY_ERROR);
            }
        }
    } else {
        console.log("checksum is NOT ok");
        this.state = this.PAIRING_IDLE;
        callback(this.RESULT_UNLIKELY_ERROR);
    }
};


PairingGeneralDataInputOutputCharacteristic.prototype.onSubscribe = function (maxValueSize, updateValueCallback) {
    console.log('PairingGeneralDataInputOutputCharacteristic - onSubscribe');

    this._updateValueCallback = updateValueCallback;

    if (this.dataStillToSend.length > 0) {
        switch (this.state) {
            case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY:

                var value = this.getNextChunk(this.dataStillToSend);
                if (value.length > 0) {
                    console.log("sending " + value.length + " bytes from onSubscribe");
                    updateValueCallback(value);
                }

                if (this.dataStillToSend.length === 0) {
                    this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY;
                }

                break;
            default:
                console.log("ERROR unexpected pairing state");
                this.state = this.PAIRING_IDLE;
        }
    } else {
        console.log("don't have more data to notify");
    }
};

PairingGeneralDataInputOutputCharacteristic.prototype.onUnsubscribe = function () {
    console.log('PairingGeneralDataInputOutputCharacteristic - onUnsubscribe');

    this._updateValueCallback = null;
};

PairingGeneralDataInputOutputCharacteristic.prototype.onIndicate = function () {
    console.log("PairingGeneralDataInputOutputCharacteristic indicate");
    if (this.dataStillToSend.length > 0) {
        if (this._updateValueCallback) {
            var value;
            switch (this.state) {
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY:
                    value = this.getNextChunk(this.dataStillToSend);
                    if (value.length > 0) {
                        console.log("sending PK: " + value.length + " bytes as indication");
                        this._updateValueCallback(value);
                    }
                    if (this.dataStillToSend.length === 0) {
                        this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY;
                    }

                    break;
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE:
                    value = this.getNextChunk(this.dataStillToSend);
                    if (value.length > 0) {
                        console.log("sending challenge 1: " + value.length + " bytes as indication");
                        this._updateValueCallback(value);
                    }
                    if (this.dataStillToSend.length === 0) {
                        this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHENTICATOR;
                    }
                    break;
                case PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE_2:
                    value = this.getNextChunk(this.dataStillToSend);
                    if (value.length > 0) {
                        console.log("sending challenge 2: " + value.length + " bytes as indication");
                        this._updateValueCallback(value);
                    }
                    if (this.dataStillToSend.length === 0) {
                        this.state = PairingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_AUTHORIZATION_DATA;
                    }
                    break;
                default:
                    console.log("ERROR unexpected pairing state");
                    this.state = this.PAIRING_IDLE;
            }
        } else {
            console.log("don't have updateValueCallback on indicate");
            this.state = this.PAIRING_IDLE;
        }
    } else {
        console.log("don't have more data to indicate");
    }
};


module.exports = PairingGeneralDataInputOutputCharacteristic;
