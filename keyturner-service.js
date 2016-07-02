var util = require('util');
var bleno = require('bleno');

var BlenoPrimaryService = bleno.PrimaryService;

var GeneralDataInputOutputCharacteristic = require('./general-data-io-characteristic');
var UserSpecificDataInputOutputCharacteristic = require('./user-data-io-characteristic');

function KeyturnerService() {
    KeyturnerService.super_.call(this, {
        uuid: 'a92ee200-5501-11e4-916c-0800200c9a66',
        characteristics: [
            new GeneralDataInputOutputCharacteristic(),
            new UserSpecificDataInputOutputCharacteristic()
        ]
    });
}

util.inherits(KeyturnerService, BlenoPrimaryService);

module.exports = KeyturnerService;
