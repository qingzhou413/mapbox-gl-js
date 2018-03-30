// @flow

const window = require('./window');

import type { Callback } from '../types/callback';

/**
 * The type of a resource.
 * @private
 * @readonly
 * @enum {string}
 */
const ResourceType = {
    Unknown: 'Unknown',
    Style: 'Style',
    Source: 'Source',
    Tile: 'Tile',
    Glyphs: 'Glyphs',
    SpriteImage: 'SpriteImage',
    SpriteJSON: 'SpriteJSON',
    Image: 'Image'
};
exports.ResourceType = ResourceType;

if (typeof Object.freeze == 'function') {
    Object.freeze(ResourceType);
}

/**
 * A `RequestParameters` object to be returned from Map.options.transformRequest callbacks.
 * @typedef {Object} RequestParameters
 * @property {string} url The URL to be requested.
 * @property {Object} headers The headers to be sent with the request.
 * @property {string} credentials `'same-origin'|'include'` Use 'include' to send cookies with cross-origin requests.
 */
export type RequestParameters = {
    url: string,
    headers?: Object,
    credentials?: 'same-origin' | 'include',
    collectResourceTiming?: boolean
};

class AJAXError extends Error {
    status: number;
    url: string;
    constructor(message: string, status: number, url: string) {
        super(message);
        this.status = status;
        this.url = url;

        // work around for https://github.com/Rich-Harris/buble/issues/40
        this.name = this.constructor.name;
        this.message = message;
    }

    toString() {
        return `${this.name}: ${this.message} (${this.status}): ${this.url}`;
    }
}

// class MockXMLHttpRequest extends window.XMLHttpRequest {
//     _url: string;
//     _response: any;

//     send() {
//         if (this._response) {
//             this.status = 200;
//             this.response = this._response;
//         } else {
//             this.status = 404;
//             this.statusText = `${this._url} mock data is error!`;
//         }
//         const onload = this.onload;
//         (onload: Function).call(this);
//     }
// }

class MockXMLHttpRequest {
    _url: string;
    _response: any;
    _withCredentials: string;
    _onloadCallback: Function;
    _statusText: string;
    _status: number;

    constructor(url, response) {
        this._url = url;
        this._response = response;
    }

    set withCredentials(withCredentials: string) {
        this._withCredentials = withCredentials;
    }

    get statusText() {
        return this._statusText;
    }

    get status() {
        return this._status;
    }

    get response() {
        return this._response;
    }

    onerror() {
    }

    open() {
    }

    setRequestHeader() {
    }

    set onload(callback: Function) {
        this._onloadCallback = callback;
    }

    send() {
        if (this._response) {
            this._status = 200;
        } else {
            this._status = 404;
            this._statusText = `${this._url} mock data is error!`;
        }
        const onload = this._onloadCallback;
        (onload: Function).call(this);
    }
}

let mockRequest: Object = {
};

function makeRequest(requestParameters: RequestParameters): XMLHttpRequest {
    const url = new window.URL(requestParameters.url);
    const hostName = url.hostname;
    const pathName = url.pathname;
    const hostMock = mockRequest[hostName];

    let xhr;
    if (hostMock && hostMock[pathName]) {
        xhr = (new MockXMLHttpRequest(requestParameters.url, hostMock[pathName]): XMLHttpRequest);
    } else {
        xhr = new window.XMLHttpRequest();
    }
    xhr.open('GET', requestParameters.url, true);
    for (const k in requestParameters.headers) {
        xhr.setRequestHeader(k, requestParameters.headers[k]);
    }
    xhr.withCredentials = requestParameters.credentials === 'include';
    return xhr;
}

exports.setMockRequest = function(mock: Object) {
    mockRequest = mock;
};

exports.getJSON = function(requestParameters: RequestParameters, callback: Callback<mixed>) {
    const xhr = makeRequest(requestParameters);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onerror = function() {
        callback(new Error(xhr.statusText));
    };
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            let data;
            try {
                data = JSON.parse(xhr.response);
            } catch (err) {
                return callback(err);
            }
            callback(null, data);
        } else {
            callback(new AJAXError(xhr.statusText, xhr.status, requestParameters.url));
        }
    };
    xhr.send();
    return xhr;
};

exports.getArrayBuffer = function(requestParameters: RequestParameters, callback: Callback<{data: ArrayBuffer, cacheControl: ?string, expires: ?string}>) {
    const xhr = makeRequest(requestParameters);
    xhr.responseType = 'arraybuffer';
    xhr.onerror = function() {
        callback(new Error(xhr.statusText));
    };
    xhr.onload = function() {
        const response: ArrayBuffer = xhr.response;
        if (response.byteLength === 0 && xhr.status === 200) {
            return callback(new Error('http status 200 returned without content.'));
        }
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            callback(null, {
                data: response,
                cacheControl: xhr.getResponseHeader('Cache-Control'),
                expires: xhr.getResponseHeader('Expires')
            });
        } else {
            callback(new AJAXError(xhr.statusText, xhr.status, requestParameters.url));
        }
    };
    xhr.send();
    return xhr;
};

function sameOrigin(url) {
    const a: HTMLAnchorElement = window.document.createElement('a');
    a.href = url;
    return a.protocol === window.document.location.protocol && a.host === window.document.location.host;
}

const transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

exports.getImage = function(requestParameters: RequestParameters, callback: Callback<HTMLImageElement>) {
    // request the image with XHR to work around caching issues
    // see https://github.com/mapbox/mapbox-gl-js/issues/1470
    return exports.getArrayBuffer(requestParameters, (err, imgData) => {
        if (err) {
            callback(err);
        } else if (imgData) {
            const img: HTMLImageElement = new window.Image();
            const URL = window.URL || window.webkitURL;
            img.onload = () => {
                callback(null, img);
                URL.revokeObjectURL(img.src);
            };
            const blob: Blob = new window.Blob([new Uint8Array(imgData.data)], { type: 'image/png' });
            (img: any).cacheControl = imgData.cacheControl;
            (img: any).expires = imgData.expires;
            img.src = imgData.data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
        }
    });
};

exports.getVideo = function(urls: Array<string>, callback: Callback<HTMLVideoElement>) {
    const video: HTMLVideoElement = window.document.createElement('video');
    video.onloadstart = function() {
        callback(null, video);
    };
    for (let i = 0; i < urls.length; i++) {
        const s: HTMLSourceElement = window.document.createElement('source');
        if (!sameOrigin(urls[i])) {
            video.crossOrigin = 'Anonymous';
        }
        s.src = urls[i];
        video.appendChild(s);
    }
    return video;
};
