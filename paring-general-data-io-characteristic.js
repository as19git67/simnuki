var util = require('util');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function ParingGeneralDataInputOutputCharacteristic() {
    ParingGeneralDataInputOutputCharacteristic.super_.call(this, {
        // uuid: 'a92ee101-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee101550111e4916c0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',   // client characterstic configuration
                value: 'Pairing commands'
            })
        ]
    });
}

util.inherits(ParingGeneralDataInputOutputCharacteristic, BlenoCharacteristic);

ParingGeneralDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    console.log("ParingGeneralDataInputOutputCharacteristic", data);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG);
    } else if (data.length > 20) {
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    } else {
        if (this.updateValueCallback) {
            console.log("updateValueCallback");
            this.updateValueCallback(new Buffer([1,2,3]));
        }
        // todo something with the data
        callback(this.RESULT_SUCCESS);
    }
};

ParingGeneralDataInputOutputCharacteristic.prototype.onIndicate = function (offset, callback) {
    console.log("ParingGeneralDataInputOutputCharacteristic indicate requested", offset);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG, null);
    }
    else {
        var data = new Buffer(2);
        data.writeUInt16BE(1, 0);
        callback(this.RESULT_SUCCESS, data);
    }
};

ParingGeneralDataInputOutputCharacteristic.prototype.onReadRequest = function (offset, callback) {
    console.log("ParingGeneralDataInputOutputCharacteristic GET requested", offset);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG, null);
    }
    else {
        var data = new Buffer(2);
        data.writeUInt16BE(1, 0);
        callback(this.RESULT_SUCCESS, data);
    }
};


module.exports = ParingGeneralDataInputOutputCharacteristic;
