"use strict";
/**
 * @license
 * Copyright 2023 William Silvermsith
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var crackleWasmDataUrl = './libcrackle.wasm';
var libraryEnv = {
    emscripten_notify_memory_growth: function () { },
    proc_exit: function (code) {
        throw "proc exit: ".concat(code);
    }
};
var wasmModule = null;
function loadCrackleModule() {
    return __awaiter(this, void 0, void 0, function () {
        var response, wasmCode, m;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (wasmModule !== null) {
                        return [2 /*return*/, wasmModule];
                    }
                    return [4 /*yield*/, fetch(crackleWasmDataUrl)];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    wasmCode = _a.sent();
                    return [4 /*yield*/, WebAssembly.instantiate(wasmCode, {
                            env: libraryEnv,
                            wasi_snapshot_preview1: libraryEnv
                        })];
                case 3:
                    m = _a.sent();
                    m.instance.exports._initialize();
                    wasmModule = m;
                    return [2 /*return*/, m];
            }
        });
    });
}
// not a full implementation of read header, just the parts we need
function readHeader(buffer) {
    // check for header "crkl"
    var magic = (buffer[0] === 'c'.charCodeAt(0) && buffer[1] === 'r'.charCodeAt(0)
        && buffer[2] === 'k'.charCodeAt(0) && buffer[3] === 'l'.charCodeAt(0));
    if (!magic) {
        throw new Error("crackle: didn't match magic numbers");
    }
    var format = buffer[4];
    if (format > 0) {
        throw new Error("crackle: didn't match format version");
    }
    var bufview = new DataView(buffer.buffer, 0);
    var format_bytes = bufview.getUint16(5, /*littleEndian=*/ true);
    var dataWidth = Math.pow(2, format_bytes & 3);
    var sx = bufview.getUint32(7, /*littleEndian=*/ true);
    var sy = bufview.getUint32(11, /*littleEndian=*/ true);
    var sz = bufview.getUint32(15, /*littleEndian=*/ true);
    return { sx: sx, sy: sy, sz: sz, dataWidth: dataWidth };
}
function arrayType(dataWidth) {
    if (dataWidth === 1) {
        return Uint8Array;
    }
    else if (dataWidth === 2) {
        return Uint16Array;
    }
    else if (dataWidth === 4) {
        return Uint32Array;
    }
    else if (dataWidth === 8) {
        return BigUint64Array;
    }
}
function compressCrackle(buffer, dataWidth, sx, sy, sz) {
    return __awaiter(this, void 0, void 0, function () {
        var m, bufPtr, streamPtr, heap, streamSize, stream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, loadCrackleModule()];
                case 1:
                    m = _a.sent();
                    if (buffer.byteLength === 0) {
                        throw new Error("crackle: Empty data buffer.");
                    }
                    else if (sx * sy * sz === 0) {
                        throw new Error("crackle: Invalid dimensions: <".concat(sx, ",").concat(sy, ",").concat(sz, ">"));
                    }
                    bufPtr = m.instance.exports.malloc(buffer.byteLength);
                    streamPtr = m.instance.exports.malloc(buffer.byteLength);
                    heap = new Uint8Array(m.instance.exports.memory.buffer);
                    heap.set(buffer, bufPtr);
                    streamSize = m.instance.exports.crackle_compress(bufPtr, dataWidth, sx, sy, sz, streamPtr, buffer.byteLength);
                    try {
                        if (streamSize <= 0) {
                            throw new Error("crackle: Failed to encode image. encoder code: ".concat(streamSize));
                        }
                        stream = new Uint8Array(m.instance.exports.memory.buffer, streamPtr, streamSize);
                        // copy the array so it can be memory managed by JS
                        // and we can free the emscripten buffer
                        return [2 /*return*/, stream.slice(0)];
                    }
                    finally {
                        m.instance.exports.free(bufPtr);
                        m.instance.exports.free(streamPtr);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function decompressCrackle(buffer) {
    return __awaiter(this, void 0, void 0, function () {
        var m, _a, sx, sy, sz, dataWidth, voxels, nbytes, bufPtr, imagePtr, heap, code, image, ArrayType;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, loadCrackleModule()];
                case 1:
                    m = _b.sent();
                    _a = readHeader(buffer), sx = _a.sx, sy = _a.sy, sz = _a.sz, dataWidth = _a.dataWidth;
                    voxels = sx * sy * sz;
                    nbytes = voxels * dataWidth;
                    if (nbytes < 0) {
                        throw new Error("crackle: Failed to decode image size. image size: ".concat(nbytes));
                    }
                    bufPtr = m.instance.exports.malloc(buffer.byteLength);
                    imagePtr = m.instance.exports.malloc(nbytes);
                    heap = new Uint8Array(m.instance.exports.memory.buffer);
                    heap.set(buffer, bufPtr);
                    code = m.instance.exports.crackle_decompress(bufPtr, buffer.byteLength, imagePtr, nbytes);
                    try {
                        if (code !== 0) {
                            throw new Error("crackle: Failed to decode image. decoder code: ".concat(code));
                        }
                        image = new Uint8Array(m.instance.exports.memory.buffer, imagePtr, nbytes);
                        // copy the array so it can be memory managed by JS
                        // and we can free the emscripten buffer
                        image = image.slice(0);
                        ArrayType = arrayType(dataWidth);
                        return [2 /*return*/, new ArrayType(image.buffer)];
                    }
                    finally {
                        m.instance.exports.free(bufPtr);
                        m.instance.exports.free(imagePtr);
                    }
                    return [2 /*return*/];
            }
        });
    });
}

function ready(fn) {
    if (document.readyState !== 'loading') {
        fn();
        return;
    }
    document.addEventListener('DOMContentLoaded', fn);
}

ready(loadCrackleModule);


