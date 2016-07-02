var util = require('util');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function ParingGeneralDataInputOutputCharacteristic() {
    ParingGeneralDataInputOutputCharacteristic.super_.call(this, {
        uuid: 'a92ee101-5501-11e4-916c-0800200c9a66',
        properties: ['write', 'writeWithoutResponse'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',
                value: 'set a value'
            })
        ]
    });
}

util.inherits(ParingGeneralDataInputOutputCharacteristic, BlenoCharacteristic);

ParingGeneralDataInputOutputCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG);
    } else if (data.length > 20) {
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    } else {
        // todo something with the data
        console.log("ParingGeneralDataInputOutputCharacteristic", data);
            callback(this.RESULT_SUCCESS);
    }
};

module.exports = ParingGeneralDataInputOutputCharacteristic;
