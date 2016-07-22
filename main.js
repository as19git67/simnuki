var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var nconf = require('nconf');
var bleno = require('bleno');
var sodium = require('sodium');
var uuid = require('uuid');

var nukiIdStr = '2000001B';

process.env['BLENO_DEVICE_NAME'] = 'Nuki_' + nukiIdStr;

var config = new nconf.Provider({
    env: true,
    argv: true,
    store: {
        type: 'file',
        file: path.join(__dirname, 'config.json')
    }
});

var strUuid = config.get('uuid');
if (!(strUuid && _.isString(strUuid) && strUuid.length === 32)) {
    var arrUUID = new Array(16);
    uuid.v1(null, arrUUID);
    config.set('uuid', new Buffer(arrUUID).toString('hex'));
    config.set('nukiId', nukiIdStr);
    config.save(function (err) {
        if (err) {
            console.log("Writing configuration failed", err);
        } else {
            console.log("Initial configuration saved");
        }
    });
} else {
    console.log("SL UUID: " + strUuid);
}


// todo: read from file or generate keys if not in file
var publicKeySample = "2FE57DA347CD62431528DAAC5FBB290730FFF684AFC4CFC2ED90995F58CB3B74";
var secretKeySample = "012345265462465716596ABCDEF1599297ADFFE75685365578954446435BACA1";

var keys = {
    slPk: null,
    slSk: null,
    clPk: null
};

var KeyturnerInitializationService = require('./keyturner-initialization-service');
var KeyturnerPairingService = require('./keyturner-pairing-service');
var KeyturnerService = require('./keyturner-service');

var keyturnerInitializationService = new KeyturnerInitializationService();
var keyturnerPairingService = new KeyturnerPairingService(keys, config);
var keyturnerService = new KeyturnerService(keys, config);


bleno.on('stateChange', function (state) {
    console.log('on -> stateChange: ' + state);

    if (state === 'poweredOn') {
        // bleno.startAdvertising('SimNuki', [keyturnerPairingService.uuid]);

        bleno.updateRssi(function (err, rssi) {
            if (err) {
                console.log("ERROR: RSSI update failed", err);
            } else {
                console.log("RSSI updated", rssi);
            }
        });

        // EIR data consists of multiple messages in the format:
        //  len (including command byte)
        //  data type (see https://www.bluetooth.com/specifications/assigned-numbers/Generic-Access-Profile)
        //  message data

        var preBuf = new Buffer("020106", 'hex'); // data type 0x01 means flags (LE General Discoverable Mode, BR/EDR Not Supported (i.e. bit 37 of LMP Extended Feature bits Page 0)

        var typeBuf = new Buffer([0x21]);   // data type 0x21 means "Service Data - 128-bit UUID"
        var uuidBuf = new Buffer(keyturnerPairingService.uuid, 'hex');
        // console.log("Length of uuid: " + uuidBuf.length);
        var uuidReverseBuf = new Buffer(uuidBuf.length);
        for (var i = 0; i < uuidReverseBuf.length; i++) {
            uuidReverseBuf[i] = uuidBuf[uuidBuf.length - i - 1];
        }
        var serviceDataBuf = new Buffer(nukiIdStr, 'hex');
        var advDataBuf = Buffer.concat([typeBuf, uuidReverseBuf, serviceDataBuf]);
        var len = advDataBuf.length;
        // console.log("Length of adv data: " + len);
        var lenBuf = new Buffer(1);
        lenBuf.writeUInt8(len);


        var advBuf = Buffer.concat([preBuf, lenBuf, advDataBuf]);

        var completeLocalName = 'Nuki_' + nukiIdStr;
        var completeLocalNameBuf = new Buffer(completeLocalName, 'ascii');
        var localNamePrefixBuf = new Buffer(2);
        localNamePrefixBuf.writeUInt8(completeLocalNameBuf.length + 1);
        localNamePrefixBuf.writeUInt8(0x09, 1); // data type 0x09 means "Complete Local Name"
        var scanDataBuf = Buffer.concat([localNamePrefixBuf, completeLocalNameBuf]);
        // console.log("Advertising with ", advBuf);
        // console.log("Scan data ", scanDataBuf);
        bleno.startAdvertisingWithEIRData(advBuf, scanDataBuf, function (err) {
            if (err) {
                console.log("ERROR: startAdvertisingWithEIRData failed:", err);
            }
        });
    } else {
        bleno.stopAdvertising();
    }
});

bleno.on('advertisingStart', function (error) {
    console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));
});

bleno.on('accept', function (address) {
    console.log('on -> accept: ' + address);
    console.log("Creating new SL key pair...");
    var slKeys = new sodium.Key.ECDH();
    keys.slPk = slKeys.pk().get();
    keys.slSk = slKeys.sk().get();
    keyturnerPairingService = new KeyturnerPairingService(keys, config);
    bleno.setServices([
        keyturnerInitializationService,
        keyturnerPairingService,
        keyturnerService
    ]);
});

bleno.on('disconnect', function () {
    console.log('on -> disconnect');
});

bleno.on('mtuChange', function (mtu) {
    console.log('on -> mtuChange: ' + mtu);
});

bleno.on('platform', function (pf) {
    console.log('on -> platform: ' + pf);
});

bleno.on('addressChange', function (ad) {
    console.log('on -> addressChange: ', ad);
});

bleno.on('rssiUpdate', function (rssi) {
    console.log('on -> rssiUpdate: ' + rssi);
});

bleno.on('servicesSet', function (error) {
    console.log('on -> servicesSet: ' + (error ? 'error ' + error : 'success'));
});

bleno.on('readRequest', function (offset) {
    console.log('on -> readRequest at offset ' + offset);
});

bleno.on('writeRequest', function (offset) {
    console.log('on -> writeRequest at offset ' + offset);
});

bleno.on('notify', function () {
    console.log('on -> notify');
});

bleno.on('indicate', function () {
    console.log('on -> indicate');
});

bleno.on('subscribe', function (offset) {
    console.log('on -> subscribe');
});

bleno.on('unsubscribe', function (offset) {
    console.log('on -> unsubscribe');
});

