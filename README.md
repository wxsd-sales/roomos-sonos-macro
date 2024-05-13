
# RoomOS Sonos Macro

This is an example POC macro which demos how to control a Sonos Player Group playback from a Cisco RoomOS Device.


## Overview

This example macro lets you sign into a Sonos Account on your RoomOS Device via OAuth and control Sonos Player Groups playback which are available in your Sonos Household.

Macro Features Include:
- Sonos OAuth locally on the Cisco Device so no backend required
- Play Group selection and filtering
- Playlist selection for each player group
- The following playback controls:
    - Mute|Volume|Play|Pause|Next and Previous Tracks


## Setup

### Prerequisites & Dependencies: 

 RoomOS/CE 11.X or above Webex Device
- Web admin access to the device to upload the macro
- Network connectivity and Internet Access for your Webex Device to sign into Sonos account and reach Sonos API Controls:
    ```
    https://api.sonos.com/*
    ```
- Web Server to host a copy of the OAuth Redirect page ( optional as GitHub pages version is already provided )
  ```
  https://wxsd-sales.github.io/roomos-sonos-macro/webapp/
  ```
- Sonos Integration with Client Id, Secret and OAuth Redirect configured. This can be created here: https://integration.sonos.com/integrations

  ![image](https://github.com/wxsd-sales/roomos-sonos-macro/assets/21026209/84e22353-7a79-4578-8e60-2085f4f3ba0d)




<!-- GETTING STARTED -->

### Installation Steps:

1. Download the ``sonos-control.js`` macro file and upload it to your Webex Room devices Macro editor via the web interface.
2. Configure the Macro by changing the initial values, there are comments explaining each one.
    ```
    const config = {
              sonos: {
                client_id: '< Your Sonos OAuth Integration Client Id >',
                client_secret: '< Your Sonos OAuth Integration Client Secret >'
              },
              filterGroups: ['My Player Group'], // Array of Group/Location names, used to filter discovered Groups
              webauth: 'https://wxsd-sales.github.io/roomos-sonos-macro/webapp', // OAuth Redirect link
              panelId: 'sonos' // Base Panel Id for this unique macro instance on this device 
            }
    ```
4. Enable the Macro on the editor.
    
    
## Demo

*For more demos & PoCs like this, check out our [Webex Labs site](https://collabtoolbox.cisco.com/webex-labs).



## License

All contents are licensed under the MIT license. Please see [license](LICENSE) for details.


## Disclaimer

Everything included is for demo and Proof of Concept purposes only. Use of the site is solely at your own risk. This site may contain links to third party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex usecases, but are not Official Cisco Webex Branded demos.


## Questions
Please contact the WXSD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=roomos-sonos-macro) for questions. Or, if you're a Cisco internal employee, reach out to us on the Webex App via our bot (globalexpert@webex.bot). In the "Engagement Type" field, choose the "API/SDK Proof of Concept Integration Development" option to make sure you reach our team. 
