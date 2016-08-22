var util = require('util');
var bleno = require('bleno');

var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function SerialNumberCharacteristic(blink1) {
    SerialNumberCharacteristic.super_.call(this, {
        uuid: '2a25',
        properties: ['read'],
        value: new Buffer("28472-862841-08373"),
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',
                value: 'Nuki serial number'
            })
        ]
    });
}

util.inherits(SerialNumberCharacteristic, BlenoCharacteristic);

module.exports = SerialNumberCharacteristic;
