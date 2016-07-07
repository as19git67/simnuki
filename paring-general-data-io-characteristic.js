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
    var dataForCrc = Buffer.slice(0, data.length - 2);
    var crcSumCalc = crc.crc16ccitt(dataForCrc);
    var crcSumRetrieved = Buffer.readUInt16LE(data.length - 2);

    if (crcSumCalc === crcSumRetrieved) {
        console.log("checksum is ok");
        if (offset) {
            callback(this.RESULT_ATTR_NOT_LONG);
        } else if (data.length > 200) {
            callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
        } else {
            if (this.updateValueCallback) {
                var cmd = new Buffer(2);
                cmd.writeUInt16LE(nukiConstants.CMD_ID_PUBLIC_KEY);
                var responseData = Buffer.concat([cmd, this.publicKey]);
                var checksum = crc.crc16ccitt(responseData);
                var checksumBuffer = new Buffer(2);
                checksumBuffer.writeUInt16LE(checksum);
                var dataWithChecksum = Buffer.concat([responseData, checksumBuffer]);
                console.log("public key data with checksum:", dataWithChecksum);

                var value = this.getNextChunk(dataWithChecksum);
                if (value.length > 0) {
                    this.updateValueCallback(value);
                }
                callback(this.RESULT_SUCCESS);
            } else {
                console.log("don't have updateValueCallback on write request");
                callback(this.RESULT_UNLIKELY_ERROR);
            }
        }
    } else {
        console.log("checksum is NOT ok");
        callback(this.RESULT_UNLIKELY_ERROR);
    }
};

ParingGeneralDataInputOutputCharacteristic.prototype.onIndicate = function () {
    console.log("ParingGeneralDataInputOutputCharacteristic indicate");
    if (this.updateValueCallback) {
        if (this.dataStillToSend.length > 0) {
            var value = this.getNextChunk(this.dataStillToSend);
            if (value.length > 0) {
                console.log("sending " + value.length + " bytes as indication");
                this.updateValueCallback(value);
            }
        } else {
            console.log("don't have more data to indicate");
        }
    } else {
        console.log("don't have updateValueCallback on indicate");
    }
};


module.exports = ParingGeneralDataInputOutputCharacteristic;
