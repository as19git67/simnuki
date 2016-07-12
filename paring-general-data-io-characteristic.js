var util = require('util');
var nukiConstants = require('./nuki-constants');
var _ = require('underscore');
var crc = require('crc');
var sodium = require('sodium');
var HSalsa20 = require('./hsalsa20');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function ParingGeneralDataInputOutputCharacteristic(keys) {
    this.state = this.PAIRING_IDLE;
    this.keys = keys;
    this.dataStillToSend = new Buffer(0);

    ParingGeneralDataInputOutputCharacteristic.super_.call(this, {
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

util.inherits(ParingGeneralDataInputOutputCharacteristic, BlenoCharacteristic);

ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_IDLE = 0;
ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY = 1;
ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY = 2;
ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE = 3;


ParingGeneralDataInputOutputCharacteristic.prototype.getNextChunk = function (data) {
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

ParingGeneralDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    var cmdId;
    console.log("ParingGeneralDataInputOutputCharacteristic", data);
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
                case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_IDLE:
                    var rCmd = data.readUInt16LE(0);
                    cmdId = data.readUInt16LE(2);
                    if (rCmd === nukiConstants.CMD_reqUEST_DATA && cmdId === nukiConstants.CMD_ID_PUBLIC_KEY) {
                        var slPk = new Buffer(0);
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
                            var wCmd = new Buffer(2);
                            wCmd.writeUInt16LE(nukiConstants.CMD_ID_PUBLIC_KEY);
                            var responseData = Buffer.concat([wCmd, slPk]);
                            var checksum = crc.crc16ccitt(responseData);
                            var checksumBuffer = new Buffer(2);
                            checksumBuffer.writeUInt16LE(checksum);
                            this.dataStillToSend = Buffer.concat([responseData, checksumBuffer]);
                            console.log("prepared to send public key data with checksum:", this.dataStillToSend);
                            this.state = ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY;

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
                case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY:
                    cmdId = data.readUInt16LE(0);
                    if (cmdId === nukiConstants.CMD_ID_PUBLIC_KEY) {
                        this.keys.clPk = data.slice(2, data.length - 2);
                        console.log("CL PUBKEY:", this.keys.clPk);

                        console.log("Creating new CL key pair");
                        var slKeys = new sodium.Key.ECDH();
                        // todo use generated slPk instead the one set in main.js
                        //this.keys.slPk = slKeys.pk().get();
                        this.keys.slSk = slKeys.sk().get();

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

                        // todo: calculate DH Key k using function dh1
                        // crypto_scalarmult_curve25519(k,secretKey,pk)
                        console.log("slSk.length: " + slSk.length + " clPk.length: " + this.keys.clPk.length);
                        var k = sodium.api.crypto_scalarmult(slSk, this.keys.clPk);
                        console.log("SL DH Key from CL PubKey and CL SK: ", s);

                        // derive a longterm shared secret key s from k using function kdf1
                        // static const unsigned char _0[16];
                        // static const unsigned char sigma[16] = "expand 32-byte k";
                        // crypto_core_hsalsa20(firstKey,_0,sharedKey,sigma)
                        var hsalsa20 = new HSalsa20();
                        var s = new Buffer(32);
                        var inv = new Buffer(16);
                        var c = new Buffer("expand 32-byte k");
                        hsalsa20.crypto_core(s, inv, k, c);
                        console.log("derived shared key: ", s);

                        this.state = ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_CHALLENGE;

                        callback(this.RESULT_SUCCESS);
                    }
                    else {
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


ParingGeneralDataInputOutputCharacteristic.prototype.onSubscribe = function (maxValueSize, updateValueCallback) {
    console.log('ParingGeneralDataInputOutputCharacteristic - onSubscribe');

    this._updateValueCallback = updateValueCallback;

    if (this.dataStillToSend.length > 0) {
        switch (this.state) {
            case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY:

                var value = this.getNextChunk(this.dataStillToSend);
                if (value.length > 0) {
                    console.log("sending " + value.length + " bytes from onSubscribe");
                    updateValueCallback(value);
                }

                if (this.dataStillToSend.length === 0) {
                    this.state = ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY;
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

ParingGeneralDataInputOutputCharacteristic.prototype.onUnsubscribe = function () {
    console.log('ParingGeneralDataInputOutputCharacteristic - onUnsubscribe');

    this._updateValueCallback = null;
};

ParingGeneralDataInputOutputCharacteristic.prototype.onIndicate = function () {
    console.log("ParingGeneralDataInputOutputCharacteristic indicate");
    if (this.dataStillToSend.length > 0) {
        if (this._updateValueCallback) {
            switch (this.state) {
                case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY:
                    var value = this.getNextChunk(this.dataStillToSend);
                    if (value.length > 0) {
                        console.log("sending " + value.length + " bytes as indication");
                        this._updateValueCallback(value);
                    }
                    if (this.dataStillToSend.length === 0) {
                        this.state = ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_CL_SEND_PUBKEY;
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


module.exports = ParingGeneralDataInputOutputCharacteristic;
