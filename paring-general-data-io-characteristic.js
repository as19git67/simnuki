var util = require('util');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function ParingGeneralDataInputOutputCharacteristic() {
    ParingGeneralDataInputOutputCharacteristic.super_.call(this, {
        uuid: 'a92ee101-5501-11e4-916c-0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2902',   // client characterstic configuration
                value: 'Commands to pair with the nuki sim'
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
        // todo something with the data
        callback(this.RESULT_SUCCESS);
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
