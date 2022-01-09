
const http = require('http');
const url = require('url');
const cp = require('child_process');

/**
 * Represents the API.
 * @param platform The AtvRemoteApi instance.
 */
function AtvRemoteApi(platform) {
    const api = this;

    // Sets the platform
    api.platform = platform;

    // Checks if all required information is provided
    if (!api.platform.config.apiPort) {
        api.platform.log('No API port provided.');
        return;
    }
    if (!api.platform.config.apiToken) {
        api.platform.log('No API token provided.');
        return;
    }
    if (!api.platform.config.atvremoteCommand) {
        api.platform.log('No command for atvremote provided.');
        return;
    }

    // Starts the server
    try {
        http.createServer(function (request, response) {
            const payload = [];

            // Subscribes for events of the request
            request.on('error', function () {
                api.platform.log('API - Error received.');
            }).on('data', function (chunk) {
                payload.push(chunk);
            }).on('end', function () {

                // Subscribes to errors when sending the response
                response.on('error', function () {
                    api.platform.log('API - Error sending the response.');
                });

                // Validates the token
                if (!request.headers['authorization']) {
                    api.platform.log('Authorization header missing.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }
                if (request.headers['authorization'] !== api.platform.config.apiToken) {
                    api.platform.log('Token invalid.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }

                // Validates the Apple TV name
                const appleTvName = api.getAppleTvName(request.url);
                if (!appleTvName) {
                    api.platform.log('No Apple TV name found.');
                    response.statusCode = 404;
                    response.end();
                    return;
                }

                // Gets the corresponding Apple TV
                const appleTv = api.platform.config.appleTvs.find(function(a) { return a.name === appleTvName; });
                if (!appleTv) {
                    api.platform.log('No Apple TV found.');
                    response.statusCode = 404;
                    response.end();
                    return;
                }
            
                // Validates the body
                let body = null;
                if (payload && payload.length > 0) {
                    body = Buffer.concat(payload).toString();
                    if (body) {
                        body = JSON.parse(body);
                    }
                }
                
                // Performs the action based on the Apple TV and method
                switch (request.method) {
                    case 'POST':
                        api.handlePost(appleTv, body, response);
                        return;
                }

                api.platform.log('No action matched.');
                response.statusCode = 404;
                response.end();
            });
        }).listen(api.platform.config.apiPort, "0.0.0.0");
        api.platform.log('API started.');
    } catch (e) {
        api.platform.log('API could not be started: ' + JSON.stringify(e));
    }
}

/**
 * Handles requests to POST /{appleTvName}.
 * @param appleTv The Apple TV.
 * @param body The body of the request.
 * @param response The response object.
 */
AtvRemoteApi.prototype.handlePost = function (appleTv, body, response) {
    const api = this;

    // Writes the response
    if (body && body.commands && body.commands.length > 0) {
        const commands = body.commands;
        
        // Gets the base command for atvremote
        const args = api.platform.config.atvremoteCommand.split(' ', 2);
        const command = args[0];
        args.splice(0, 1);

        // Appends the Apple TV specific arguments
        args.push('cli');
        args.push('--manual');
        args.push('--address');
        args.push(appleTv.ipAddress);
        args.push('--port');
        args.push(appleTv.airplayPort);
        args.push('--protocol');
        args.push('airplay');
        args.push('--id');
        args.push('apple');
        args.push('--airplay-credentials');
        args.push(appleTv.airplayCredentials);

        // Appends the Apple TV specific arguments
        // args.push('cli');
        // args.push('--manual');
        // args.push('--address');
        // args.push(appleTv.ipAddress);
        // args.push('--port');
        // args.push(appleTv.mrpPort);
        // args.push('--protocol');
        // args.push('mrp');
        // args.push('--id');
        // args.push('apple');
        // args.push('--mrp-credentials');
        // args.push(appleTv.mrpCredentials);
    
        // Spawns the process
        const childProcess = cp.spawn(command, args);
        childProcess.stdout.setEncoding('utf8');

        // Handles communication
        let stdout = '';
        childProcess.stderr.on('data', function (_) { });
        childProcess.stdout.on('data', function (data) {
            stdout += data.toString();

            // Processes only if the stdout ends with three arrows
            if (stdout.endsWith('pyatv> ')) {
                stdout = '';

                // Applies the next command
                if (commands.length > 0) {
                    const currentCommand = commands.splice(0, 1)[0];
                    if (currentCommand.startsWith('wait')) {
                        setTimeout(function() {
                            childProcess.stdin.write('\n');
                        }, parseInt(currentCommand.split(' ')[1]));
                    } else {
                        childProcess.stdin.write(currentCommand + '\n');
                    }
                } else {
                    childProcess.stdin.write('exit\n');
                    childProcess.stdin.end();
                }
            }
        });
        
        // Waits for the process to finish
        childProcess.on('exit', function () {
          response.statusCode = 200;
          response.end();
        });
    } else {
        api.platform.log('Error while executing commands.');
        response.statusCode = 400;
        response.end();
    }
}

/**
 * Gets the Apple TV name from the URL.
 * @param uri The uri of the request.
 * @returns Returns the Apple TV name.
 */
AtvRemoteApi.prototype.getAppleTvName = function (uri) {

    // Parses the request path
    const uriParts = url.parse(uri);

    // Checks if the URL matches the Apple TV name
    uriMatch = /\/(.+)/g.exec(uriParts.pathname);
    if (uriMatch && uriMatch.length === 2) {
        return decodeURI(uriMatch[1]);
    }

    // Returns null as no Apple TV name found
    return null;
}

/**
 * Defines the export of the file.
 */
module.exports = AtvRemoteApi;
