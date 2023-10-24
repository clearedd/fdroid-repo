const fs = require(`fs-extra`);
const child = require(`child_process`);
var crypto = require('crypto');
const archiver = require("archiver");

function sha256(input) {
    var hash = crypto.createHash('sha256');
    hash.setEncoding('hex');
    hash.write(input);
    hash.end();
    return hash.read();
}

function spawn(cmd, args, options) {
    var log = ``;
    //console.log(cmd, args);
    return new Promise(r => child.spawn(cmd, args, options)
        .on(`close`, () => { r(log) })
        .on(`exit`, (status, signal) => { if (status) console.log(`Command failed with ${status} ${cmd}`) })
        .on(`error`, console.log)
        .stdout.on(`data`, c => log += c)
    )
}

async function fileForFdroid(file, url) {
    if (!url) url = file;
    if (!fs.existsSync(file)) return console.log(`No file ${file}`);
    let hash = await new Promise(r => {
        let stream = fs.createReadStream(file);
        let hash = crypto.createHash(`sha256`);
        hash.setEncoding('hex');
        stream.on('end', function () {
            hash.end();
            r(hash.read());
        });
        stream.pipe(hash);
    });
    //if (module.exports.app)
    //    module.exports.app.get(`/${url}`, express.static(path.join(process.cwd(), file)));
    //if (module.exports.ipfs)
    //    var CID = await module.exports.ipfs.add(fs.readFileSync(file).toString());
    return {
        "name": `/${url}`, // thees HAVE TO start with /
        "sha256": hash,
        "size": fs.statSync(file).size,
        //"ipfsCIDv1": CID ? JSON.parse(JSON.stringify(CID, null, 4))["/"] : undefined,
    };
}

async function filesForFdroid(localizastions = { "en-US": { file: "", url: "" } }) {
    Object.keys(localizastions).forEach(async x =>
        localizastions[x] = await fileForFdroid(localizastions[x].file, localizastions[x].url)
    );
    return localizastions;
}

//function readManifest(manifest) {
//    var convert = require('xml-js');
//    if (!manifest) return console.log(`Missing manifest input`);
//    var result1 = convert.xml2js(manifest);
//    var m = result1.elements[0]; // manifest
//    var sdk = m.elements.find(x => x.name == `uses-sdk`).attributes;
//    var perms = m.elements.find(x => x.name == `uses-permission`).attributes;
//    var features = m.elements.find(x => x.name == `uses-feature`).attributes;
//    var application = m.elements.find(x => x.name == `application`).attributes;
//    if (application[`android:testOnly`] == `true` || application[`android:debuggable`] == `true`) return console.log(`Not publishing testOnly/debuggable version.`); // testOnly cant be installed (without adb) anyway.
//    return {
//        "versionCode": parseInt(m.attributes['android:versionCode']),
//        "versionName": m.attributes['android:versionName'],
//        "package": m.attributes.package,
//        "uses-sdk": {
//            "minSdkVersion": parseInt(sdk[`android:minSdkVersion`]),
//            "targetSdkVersion": parseInt(sdk[`android:targetSdkVersion`])
//        },
//        "uses-permission": Object.keys(perms).flatMap(x => {
//            let p = {};
//            p[x.replace(`android:`, ``)] = perms[x];
//            // "maxSdkVersion": 30
//            return p;
//        }),
//        // not needed for f-droid but for me :)
//        "name": application[`android:label`],
//        "description": application[`android:description`],
//    };
//}

// So scuffed.
function readManifestApk(apk) {
    if (!fs.existsSync(apk)) return console.log(`apk dosent exist: ${apk}`);
    let raw = child.spawnSync(`${module.exports.buildtools}/aapt2`, [`dump`, `badging`, apk]).output.toString();
    var j = {};
    raw.split(`\n`).forEach(x => {
        let kv = x.split(`:`);
        //console.log(kv);
        if (kv[0].split(`=`)[1]) return j[kv[0].split(`=`)[0]] = kv[0].split(`=`)[1].replace(/'/g, ``);
        kv[0] = kv[0].replace(/[^A-Za-z]+/g, '');
        if (!kv[1]) return;
        if (!kv[1].includes(`=`)) {
            kv[1] = kv[1].replace(/'/g, ``);
            if (kv[1] && !isNaN(kv[1])) kv[1] = parseInt(kv[1]);
            else kv[1] = String(kv[1]).trimStart();
            j[kv[0]] = kv[1];
        } else {
            j[kv[0]] = {};
            let s = 0;
            let str = ``;
            let key = ``;
            for (var i = 0; i < kv[1].length; i++) {
                let c = kv[1][i];
                switch (s) {
                    case 0:
                        if (c == `=`) {
                            s = 1;
                            key = str.replace(/[^A-Za-z]+/g, '');
                            str = ``;
                            i++;
                        } else
                            str += c;
                        break;
                    case 1:
                        if (c == `'`) {
                            if (str && !isNaN(str)) str = parseInt(str);
                            j[kv[0]][key] = str;
                            str = ``;
                            key = ``;
                            s = 0;
                        } else
                            str += c;
                        break;
                }
            }
        }
    });
    //console.log(`=================`);
    //console.log(raw);
    //console.log(`=================`);
    //console.log(j);
    if (j.testOnly) throw new Error(`Not publishing testOnly/debuggable version.`);
    if (!j.package) throw new Error(`Invalid apk badge\n`, j);
    return {
        "versionCode": j.package.versionCode,
        "versionName": j.package.versionName,
        "package": j.package.name,
        "uses-sdk": {
            "minSdkVersion": j.sdkVersion,
            "targetSdkVersion": j.targetSdkVersion
        },
        //"uses-permission": j.usespermission,
        // not needed for f-droid but for me :)
        "name": j.applicationlabel, // I didn not miss the .
        //"description": j,
    };
}

module.exports.buildtools = `${__dirname}/build-tools-34.0.0`;
module.exports.package = class {
    // https://f-droid.org/en/docs/Build_Metadata_Reference/
    constructor(meta = {
        "name": {
            "en-US": ""
        },
        "description": {
            "en-US": ""
        },
        "summary": {
            "en-US": ""
        },
        "icon": {
            "en-US": { file: "./file.png", url: "file.png" } // just saying, official is 512x512. Also works for me with like 16x16. So dont use 160x160.
        },
        "categories": [
            "",
        ],
        "changelog": "", // link
        "suggestedVersionCode": 0,
        "donate": [
            "",
        ],
        "issueTracker": "", // link
        "liberapay": "",
        "license": "",
        "openCollective": "",
        "sourceCode": "", // link
        "translation": "", // link
        "webSite": "", // link
        //"authorWebSite": "",
        "added": 0,
        "featureGraphic": {
            "en-US": { file: "./file.png", url: "file.png" }
        },
        "screenshots": {
            "en-US": {
                "phone": [ // there are no other
                    { file: "./file.png", url: "file.png" }
                ]
            }
        },
        "preferredSigner": "",
    }) {
        if (meta.icon) filesForFdroid(meta.icon);
        if (meta.featureGraphic) filesForFdroid(meta.featureGraphic);
        if (meta.screenshots)
            Object.keys(meta.screenshots).forEach(async x => // currently there is only "phone" but who knows, it might change
                filesForFdroid(meta.screenshots[x])
            );
        this.meta = meta;
        this.versions = [];
    }
    /*"antiFeatures": {
        "NonFreeNet": {
            "en-US": "Comment why"
        }
    },*/
    /**
     * 
     * @param {String} file 
     * @param {String} fileURL
     * @param {Array} signer sha256 signers
     * @param {String} src 
     * @param {Object} antiFeatures https://f-droid.org/en/docs/Build_Metadata_Reference/#build_antifeatures
     * @param {Object} whatsNew changelog for that version, localized e.g {"en-US":"localizastion upadte! Yipee!"}
     * @param {Array} releaseChannels array of some channels? This can be left empty e.g ["Beta"]
     */
    async addVersion(file, fileURL,/* beta = false,*/ signer = [], src = { file: ``, url: `` }, antiFeatures = {}, whatsNew = {}, releaseChannels = []) {
        let m = readManifestApk(file);
        //console.log(m);
        if (!m) throw new Error(`failed to read manifest`);
        this.versions.push({
            "added": fs.statSync(file).mtime.getTime(),
            "file": await fileForFdroid(file, fileURL),
            "manifest": m,
            "antiFeatures": antiFeatures,
            "signer": {
                "sha256": signer
            },
            "src": src.file && src.url ? await fileForFdroid(src.file, src.url) : undefined,
            "whatsNew": whatsNew,
            "releaseChannels": releaseChannels,
            //"beta": beta
        });
    }
    out() {
        let mN = this.versions[0].manifest; // manifest NEW (of latest version)
        // update metadata
        this.meta.packageName = mN.package;
        if (!this.meta.name && mN.name) this.meta.name = { "en-US": mN.name };
        if (!this.meta.description && mN.description) this.meta.name = { "en-US": mN.description };
        this.meta.lastUpdated = this.versions[0].added;
        // set suggestedVersionCode aka. beta versions are above it
        //for (var i = 0; i < this.versions.length; i++)
        //    if (!mN.beta) {
        //        this.meta.suggestedVersionCode = mN.versionCode;
        //        break;
        //    }
        // do versions
        var versions = {};
        this.versions.forEach(y => {
            delete y.beta;
            versions[y.file.sha256] = y
        });

        return {
            metadata: this.meta,
            versions: versions,
        };
    }
}

module.exports.repo = class {
    /**
     * 
     * @param {*} signing Dont include "+" or "," X.500 Distinguished Names 
     * @param {*} repo 
     */
    constructor(signing = {
        CN: signing.commonName,
        OU: signing.organizationUnit,
        O: signing.organizationName,
        L: signing.localityName,
        S: signing.stateName,
        C: signing.country
    },
        repo = {
            "name": { "en-US": "" },
            "icon": { "en-US": { file: "./file.png", url: "file.png" } },
            "address": `https://example.com`,
            "description": { "en-US": "Hello world" },
            "mirrors": [
                /*{
                    "url": "https://ftp.fau.de/fdroid/repo",
                    "location": "de"
                },*/
            ],
            "antiFeatures": {
                /*"Advertising": {
                    "icon": {
                        "name": "advertising-icon.png",
                        "sha256": "b1f27fa87f8cabca50cdcd462a0f500d79d883b965a498d0e49eea560b39be1f",
                        "size": 123
                    },
                    "description": {
                        "en-US": "This Anti-Feature is applied to an app that contains advertising."
                    }
                }*/
            },
            "categories": {
                /*"System": {
                    "icon": {
                        "en-US": {file: "./file.png","/file.png"}
                    }
                    "name": {
                        "en-US": "Apps for your System"
                    }
                }*/
            }
        }
    ) {
        if (repo.categories)
            Object.keys(repo.categories).forEach(x =>
                filesForFdroid(repo.categories[x].icon)
            );
        this.sign = signing;
        this.packages = {};
        this.repo = repo;
    }

    /**
     * Add a package
     * @param {module.KeyExportOptions.package} package 
     * @returns 
     */
    addPackage(pack) {
        this.packages[pack.meta.packageName] = pack;
    }

    str_sign() {
        var v = Object.values(this.sign);
        return Object.keys(this.sign).flatMap((x, i) => `${x}=${v[i]}`).join(`,`);
    }

    /**
     * Run before genEntry. Generates the index
     * @returns 
     */
    async genIndex() {
        var json = {
            "repo": this.repo,
            "packages": {}
        };
        if (this.repo.icon) {
            let k = Object.keys(this.repo.icon);
            for (var i = 0; i < k.length; i++) {
                let x = k[i];
                this.repo.icon[x] = await fileForFdroid(this.repo.icon[x].file, this.repo.icon[x].url)
            }
        }
        this.repo.timestamp = new Date().getTime();
        Object.values(this.packages).forEach(x => {
            if (!x.versions[0]) return console.log(`A package really should have a version, since without it, it wont show up`);
            json.packages[x.versions[0].manifest.package] = x.out()
        });

        this.index = JSON.stringify(json);
        return json;
    }

    /**
     * Generates a keystore (if one dosent exist) and generates the entry.jar
     * @param {String} keystore keystore path (generated)
     * @param {String} alias 
     * @param {String} storepass 
     * @param {String} keypass 
     * @returns 
     */
    async genEntry(keystore, alias, storepass, keypass, entry = `./entry.jar`) {
        return new Promise(r => {
            if (!this.index) return console.error(`You godda generate the index for the repo first (genIndex)`);
            var json = {
                timestamp: new Date().getTime(),
                version: 30001,
                maxAge: 14,
                index: {
                    name: "/index-v2.json",
                    sha256: sha256(this.index),
                    size: this.index.length,
                    numPackages: Object.keys(this.packages).length,
                },
                diffs: {},
            };
            const archive = archiver("zip", {
                zlib: { level: 9 }, // Sets the compression level.
            });
            const jarout = fs.createWriteStream(entry);
            archive.pipe(jarout);
            archive.on('error', function (err) {
                throw err;
            });
            archive.on('warning', function (err) {
                console.log(err);
                if (err.code === 'ENOENT') {
                    // log warning
                } else {
                    throw err;
                }
            });
            jarout.on(`close`, async () => {
                // generate keystore
                if (!fs.existsSync(keystore))
                    await spawn(
                        `keytool`,
                        [
                            `-genkey`,
                            `-keyalg`,
                            `RSA`,
                            `-noprompt`,
                            `-alias`,
                            alias,
                            `-dname`,
                            this.str_sign(),
                            `-keystore`,
                            keystore,
                            `-storepass`,
                            storepass,
                            `-keypass`,
                            keypass,
                        ],
                        { env: {} }
                    );
                // generate the public key
                var pubKey = await spawn(
                    `keytool`,
                    [
                        `-list`,
                        `-v`,
                        `-alias`,
                        alias,
                        `-keystore`,
                        keystore,
                        `-storepass`,
                        storepass,
                        `-keypass`,
                        keypass,
                    ],
                    { env: {} }
                );
                this.fingerprint = pubKey.split(`\n`).find(x => x.trimStart().startsWith(`SHA256`)).trimStart().replace(`SHA256: `,``).replace(/:/g,``).toLowerCase();
                /*var pubKey = await spawn(
                    `keytool`,
                    [
                        `-exportcert`,
                        `-alias`,
                        alias,
                        `-keystore`,
                        keystore,
                        `-storepass`,
                        storepass,
                        `-keypass`,
                        keypass,
                    ],
                    { env: {} }
                );

                const digest = crypto.createHash('sha256').update(pubKey).digest();
                this.fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
                */
                // sign ("attributes not matching" (in client error) means not signed)
                if (!fs.existsSync(keystore)) return console.error(`keystore dosent exist ${keystore}`);
                if (!fs.existsSync(entry)) return console.error(`entry.jar dosent exist ${entry}`);
                // sign the entry.jar
                await spawn(
                    `${module.exports.buildtools}/apksigner`,
                    [
                        `sign`,
                        `--min-sdk-version`,
                        `23`,
                        `--max-sdk-version`,
                        `24`,
                        `--v1-signing-enabled`,
                        `true`,
                        `--v2-signing-enabled`,
                        `false`,
                        `--v3-signing-enabled`,
                        `false`,
                        `--v4-signing-enabled`,
                        `false`,
                        `--ks`,
                        keystore,
                        `--ks-pass`,
                        `env:FDROID_KEY_STORE_PASS`,
                        `--ks-key-alias`,
                        alias,
                        `--key-pass`,
                        `env:FDROID_KEY_PASS`,
                        entry,
                    ],
                    {
                        env: {
                            'FDROID_KEY_STORE_PASS': storepass,
                            'FDROID_KEY_PASS': keypass
                        }
                    }
                );

                r();
            });
            archive.append(JSON.stringify(json), { name: "entry.json" });
            archive.finalize();
        });
    }
}
