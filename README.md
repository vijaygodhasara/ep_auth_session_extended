ep_auth_session_extended
=============

A small script for [etherpad-lite](https://github.com/ether/etherpad-lite) which provides a route that authenticates the user with the provided sessionID parameter and redirects to the given padName.
Usefull when integrating etherpad in a application on a another domain.

[![NPM version][npm-image]][npm-url]
[![node version][node-image]][node-url]
[![license][license-image]][license-url]
[![npm download][download-image]][download-url]

[npm-image]: http://img.shields.io/npm/v/ep_auth_session_extended.svg?style=flat-square
[npm-url]: http://www.npmjs.com/package/ep_auth_session_extended
[node-image]: https://img.shields.io/badge/node.js-%3E=_0.10-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[license-image]: https://img.shields.io/npm/l/ep_auth_session_extended.svg?style=flat-square
[license-url]: https://www.npmjs.com/package/ep_auth_session_extended
[download-image]: https://img.shields.io/npm/dt/ep_auth_session_extended.svg?style=flat-square
[download-url]: https://www.npmjs.com/package/ep_auth_session_extended


## Install
[![ep_auth_session_extended](https://nodei.co/npm/ep_auth_session_extended.png)](https://www.npmjs.com/package/ep_auth_session_extended)

Restart your etherpad-lite instance to recognize the plugin.

# Usage
Include an iframe with the src set to etherpad page /auth_session?sessionID=SESSION_ID&padName=PAD_NAME
```html
<iframe src="http://pad.test.de/auth_session?sessionID=SESSION_ID&padName=PAD_NAME" width="600" height="400"></iframe>
```
You can optionally include the groupID as well
```html
<iframe src="http://pad.test.de/auth_session?sessionID=SESSION_ID&groupID=GROUP_ID&padName=PAD_NAME" width="600" height="400"></iframe>
```
