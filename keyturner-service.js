var util = require('util');
var bleno = require('bleno');

var BlenoPrimaryService = bleno.PrimaryService;

var GeneralDataInputOutputCharacteristic = require('./general-data-io-characteristic');
var UserSpecificDataInputOutputCharacteristic = require('./user-data-io-characteristic');

function KeyturnerService(keys, config) {
    KeyturnerService.super_.call(this, {
        // uuid: 'a92ee200-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee200550111e4916c0800200c9a66',
        characteristics: [
            new GeneralDataInputOutputCharacteristic(keys, config),
            new UserSpecificDataInputOutputCharacteristic(keys, config)
        ]
    });
}

util.inherits(KeyturnerService, BlenoPrimaryService);

module.exports = KeyturnerService;
