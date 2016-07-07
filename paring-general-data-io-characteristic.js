var util = require('util');
var nukiConstants = require('./nuki-constants');
var _ = require('underscore');
var crc = require('crc');


var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function ParingGeneralDataInputOutputCharacteristic(publicKey, privateKey) {
    if (_.isString(publicKey)) {
        this.publicKey = new Buffer(publicKey, 'hex');
    } else {
        if (_.isArray(publicKey)) {
            this.publicKey = new Buffer(publicKey);
        }
    }
    if (_.isString(privateKey)) {
        this.privateKey = new Buffer(privateKey, 'hex');
    } else {
        if (_.isArray(privateKey)) {
            this.privateKey = new Buffer(privateKey);
        }
    }
    this.state = this.PAIRING_IDLE;

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
            var rCmd = data.readUInt16LE(0);
            var cmdId = data.readUInt16LE(2);
            switch (this.state) {
                case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_IDLE:
                    if (rCmd === nukiConstants.CMD_reqUEST_DATA && cmdId === nukiConstants.CMD_ID_PUBLIC_KEY) {
                        var wCmd = new Buffer(2);
                        wCmd.writeUInt16LE(nukiConstants.CMD_ID_PUBLIC_KEY);
                        var responseData = Buffer.concat([wCmd, this.publicKey]);
                        var checksum = crc.crc16ccitt(responseData);
                        var checksumBuffer = new Buffer(2);
                        checksumBuffer.writeUInt16LE(checksum);
                        this.dataStillToSend = Buffer.concat([responseData, checksumBuffer]);
                        console.log("prepared to send public key data with checksum:", this.dataStillToSend);
                        this.state = ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY = 1;

                        callback(this.RESULT_SUCCESS);
                    }
                    else {
                        console.log("command or command identifier wrong");
                        callback(this.RESULT_UNLIKELY_ERROR);
                    }
                    break;
                default:
                    console.log("ERROR unexpected pairing state");
                    callback(this.RESULT_UNLIKELY_ERROR);
            }
        }
    } else {
        console.log("checksum is NOT ok");
        callback(this.RESULT_UNLIKELY_ERROR);
    }
};


ParingGeneralDataInputOutputCharacteristic.prototype.onSubscribe = function (maxValueSize, updateValueCallback) {
    console.log('ParingGeneralDataInputOutputCharacteristic - onSubscribe');

    this._updateValueCallback = updateValueCallback;

    switch (this.state) {
        case ParingGeneralDataInputOutputCharacteristic.prototype.PAIRING_SL_SEND_PUBKEY:

            if (this.dataStillToSend.length > 0) {
                var value = this.getNextChunk(this.dataStillToSend);
                if (value.length > 0) {
                    console.log("sending " + value.length + " bytes from onSubscribe");
                    updateValueCallback(value);
                }
            } else {
                console.log("don't have more data to indicate");
            }

            break;
        default:
            console.log("ERROR unexpected pairing state");
            callback(this.RESULT_UNLIKELY_ERROR);
    }
};

ParingGeneralDataInputOutputCharacteristic.prototype.onUnsubscribe = function () {
    console.log('ParingGeneralDataInputOutputCharacteristic - onUnsubscribe');

    this._updateValueCallback = null;
};

ParingGeneralDataInputOutputCharacteristic.prototype.onIndicate = function () {
    console.log("ParingGeneralDataInputOutputCharacteristic indicate");
    if (this._updateValueCallback) {
        if (this.dataStillToSend.length > 0) {
            var value = this.getNextChunk(this.dataStillToSend);
            if (value.length > 0) {
                console.log("sending " + value.length + " bytes as indication");
                this._updateValueCallback(value);
            }
        } else {
            console.log("don't have more data to indicate");
        }
    } else {
        console.log("don't have updateValueCallback on indicate");
    }
};


module.exports = ParingGeneralDataInputOutputCharacteristic;
