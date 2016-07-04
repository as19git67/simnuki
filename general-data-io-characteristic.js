var util = require('util');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function GeneralDataInputOutputCharacteristic() {
    GeneralDataInputOutputCharacteristic.super_.call(this, {
        uuid: 'a92ee201-5501-11e4-916c-0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',
                value: 'set a value'
            })
        ]
    });
}

util.inherits(GeneralDataInputOutputCharacteristic, BlenoCharacteristic);

GeneralDataInputOutputCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
    console.log("GeneralDataInputOutputCharacteristic write", data);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG);
    } else if (data.length > 200) {
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    } else {
        console.log("data to write is " + data.length + " bytes long");
        // todo something with the data
        callback(this.RESULT_SUCCESS);
    }
};

GeneralDataInputOutputCharacteristic.prototype.onReadRequest = function (offset, callback) {
    console.log("GeneralDataInputOutputCharacteristic GET requested", offset);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG, null);
    }
    else {
        var data = new Buffer(2);
        data.writeUInt16BE(1, 0);
        callback(this.RESULT_SUCCESS, data);
    }
};

module.exports = GeneralDataInputOutputCharacteristic;
