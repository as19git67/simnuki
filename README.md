#### Tool Dependencies

```sh
sudo apt-get install libtool
```

#### Running without root/sudo

(see https://github.com/sandeepmistry/bleno#running-on-linux)

Run the following command:

```sh
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

This grants the ```node``` binary ```cap_net_raw``` privileges, so it can start/stop BLE advertising.

__Note:__ The above command requires ```setcap``` to be installed, it can be installed using the following:

 * apt: ```sudo apt-get install libcap2-bin```

