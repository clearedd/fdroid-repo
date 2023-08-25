# [F-Droid](https://f-droid.org) repo

Unoffical package to setup a fdroid repository quite quickly

## Notes

You should have [`keytool`](https://stackoverflow.com/questions/4830253/where-is-the-keytool-application)

You can link people to `market://details?id=com.organizastion.package` (which can send people to *AN* appstore).
You can also link people to your repo so they can easily add it `fdroidrepo://example.com` (`https://` is by default).

build tools are included in the package, you can check the makefile to see

## Example

```js
const config = {
    website: `example.com`,
    HTTPSport: 443,
    HTTPport: 8080,
    secure: false,
};

(async () => {
    // setup a express server
    const fs = require(`fs`);
    const express = require(`express`);
    const http = require(`http`);
    const https = require(`https`);
    const path = require(`path`);

    // https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
    const { networkInterfaces } = require("os");
    function getIP() {
        const nets = networkInterfaces();
        const results = Object.create(null); // Or just '{}', an empty object

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
                const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
                if (net.family === familyV4Value && !net.internal) {
                    if (!results[name]) {
                        results[name] = [];
                    }
                    results[name].push(net.address);
                }
            }
        }
        return Object.values(results)[0];
    }

    var app = express();

    if (config.secure) {
        if (!fs.existsSync(`./${config.website}.key`) || !fs.existsSync(`./${config.website}.pem`)) return quit(`Missing https key/pem files`);
        var server = https.createServer({
            key: fs.readFileSync(`./${config.website}.key`),
            cert: fs.readFileSync(`./${config.website}.pem`),
        }, app)
            .on('error', (err) => console.log(`https ${config.HTTPSport} : failed`, err))
            .listen(config.HTTPSport, () =>
                console.log(`https://${config.website} : enabled`));
    } else
        var server = http.createServer(app)
            .on('error', (err) => console.log(`http ${config.HTTPport} : failed`, err))
            .listen(config.HTTPport, () =>
                console.log(`http://${getIP()}:${server.address().port} : enabled`));

    // F-Droid
    var fd = require(`fdroid-repo`);
    //fd.buildtools = `./wherever`; // default is linux version which comes with the package

    var repo = new fd.repo({
        CN: "SomeName",
        O: "Org",
        C: "EST"
    }, {
        name: { "en-US": "Repo name" },
        icon: {
            "en-US": { file: "./favicon.ico", url: "favicon.ico" } // files are automatically sized and hashed. urls MUST start with a /, so its added by default
        },
        address: config.secure ? `https://${config.website}` : `http://${getIP()}:${server.address().port}`,
        description: {
            "en-US": "hello world"
        }
        // there are more ofc
    });

    var pack = new fd.package({
        "name": {
            "en-US": "Name"
        },
        "description": {
            "en-US": "Description"
        },
        "summary": {
            "en-US": "Summey"
        },
        "icon": {
            "en-US": { file: "./favicon.ico", url: "favicon.ico" }
        },
        "added": new Date().getTime() // required
        // https://f-droid.org/en/docs/Build_Metadata_Reference/
    });
    await pack.addVersion(
        `./app.apk`,
        `app.apk`,
        //fs.readFileSync(`./androidManifest.xml`), // able to read from apk, wowe
    );
    repo.addPackage(pack);

    // run thees when you have made ANY changes to the repo
    await repo.genIndex()
    // DO NOT set the alias as "alias", it will fail to sign and give you an "No attributes for entry.json" (in the client)
    await repo.genEntry(`./key.keystore`, `NOTalias`, `password`, `password`, `./entrier.jar`);

    // routing

    app.use(`/app.apk`, express.static(path.join(__dirname, `./app.apk`)));
    app.get("*/entry.jar", express.static(path.join(__dirname, `entrier.jar`)));

    app.get("*/index-v2.json", (req, res, next) => {
        res.setHeader(`Content-Type`, `application/json`);
        res.send(repo.index);
    });
})();
```

## updating build tools

```sh
make install # installs the sdkmanager and buildtools
make list # lists packages from sdkmanger (you would use this to find the newest version of build tools)
# ./android/build-tools/34.0.0/
```

## Send version and UUID to servers (in fdroid settings)

adds `client_version` (also in headers by default) & `id` in paramaters.
Wow that is useless.

## Links

- https://gitlab.com/fdroid/wiki/-/wikis/Index-V2
- https://f-droid.org/en/docs/All_our_APIs/
- https://f-droid.org/repo/entry.jar
- https://f-droid.org/repo/index-v2.json
