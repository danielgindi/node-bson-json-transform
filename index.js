const Stream = require('stream');
const Util = require('util');
const Transform = Stream.Transform;

const E_TYPE_ENDOBJECT = 0x00;
const E_TYPE_DOUBLE = 0x01;
const E_TYPE_STRING = 0x02;
const E_TYPE_DOCUMENT = 0x03;
const E_TYPE_ARRAY = 0x04;
const E_TYPE_BINARY = 0x05;
const E_TYPE_UNDEFINED = 0x06;
const E_TYPE_OBJECT_ID = 0x07;
const E_TYPE_BOOL = 0x08;
const E_TYPE_INT64_UTC_DATETIME = 0x09;
const E_TYPE_NULL = 0x0A;
const E_TYPE_REGEX = 0x0B;
const E_TYPE_DBPOINTER_DEPRECATED = 0x0C;
const E_TYPE_JS = 0x0D;
const E_TYPE_SYMBOL = 0x0E;
const E_TYPE_JS_W_SCOPE = 0x0F;
const E_TYPE_INT32 = 0x10;
const E_TYPE_INT64_TIMESTAMP = 0x11;
const E_TYPE_INT64 = 0x12;
const E_TYPE_MIN_KEY = 0xFF;
const E_TYPE_MAX_KEY = 0x7F;

const E_SUBTYPE_GENERIC = 0x00;
const E_SUBTYPE_FUNCTION = 0x01;
const E_SUBTYPE_BINARY_OLD = 0x02;
const E_SUBTYPE_UUID_OLD = 0x03;
const E_SUBTYPE_UUID = 0x04;
const E_SUBTYPE_MD5 = 0x05;
const E_SUBTYPE_USER_DEFINED = 0x80;

var readInt64LE = function (buffer, offset) {
    var low = buffer.readUInt32LE(offset);
    var high = buffer.readInt32LE(offset + 4);
    return (high * 0x100000000) + low;
};

var readInt64String = (function () {

    var pad = function (value, length) {
        value = value.toString();
        while (value.length < length) {
            value = '0' + value;
        }
        return value;
    };

    // Algorithm taken from http://homepage.cs.uiowa.edu/~jones/bcd/decimal.html#signed
    // And adjusted for signed numbers.

    return function (signed, buffer, offset) {
        var value = '';

        var d0 = buffer.readUInt16LE(offset);
        var d1 = buffer.readUInt16LE(offset + 2);
        var d2 = buffer.readUInt16LE(offset + 4);
        var d3 = buffer.readUInt16LE(offset + 6);
        var q;

        if (signed && (d3 & 0x8000) === 0x8000) {
            d0 = d0 ^ 0xffff;
            d1 = d1 ^ 0xffff;
            d2 = d2 ^ 0xffff;
            d3 = d3 ^ 0xffff;
        } else {
            signed = false;
        }

        d0 = 656 * d3 + 7296 * d2 + 5536 * d1 + d0 + (signed ? 1 : 0);
        q = d0 / 10000;
        d0 = d0 % 10000;

        d1 = q + 7671 * d3 + 9496 * d2 + 6 * d1;
        q = d1 / 10000;
        d1 = d1 % 10000;

        d2 = q + 4749 * d3 + 42 * d2;
        q = d2 / 10000;
        d2 = d2 % 10000;

        d3 = q + 281 * d3;
        q = d3 / 10000;
        d3 = d3 % 10000;

        value += Math.floor(q);
        value += pad(Math.floor(d3), 4);
        value += pad(Math.floor(d2), 4);
        value += pad(Math.floor(d1), 4);
        value += pad(Math.floor(d0), 4);

        var i = 0;
        while (value[i] === '0') {
            i++;
        }
        if (i > 0) {
            value = value.slice(i) || '0';
        }

        if (signed) {
            value = '-' + value;
        }

        return value;
    };

})();

/*
// This one is 370x times slower than `readInt64String`
var readIntString = (function () {

    var plus = function(dest, add, base) {
        for (var i = 0, len = Math.max(dest.length, add.length); i < len; i++) {
            var val = (dest[i] || 0) + (add[i] || 0);
            if (val >= 10) {
                dest[i] = val % base;
                dest[i + 1] = (dest[i + 1] || 0) + Math.floor(val / base);
                if (dest.length > len) {
                    len++;
                }
            } else {
                dest[i] = val;
            }
        }
        return dest;
    };

    var pow = function(dest, pow, base) {
        if (pow == 0) {
            while (dest.length > 1) {
                dest.pop();
            }
            dest[0] = 1;
            return dest;
        }

        for (var i = 1; i < pow; i++) {
            plus(dest, dest.slice(0), base);
        }
        return dest;
    };

    return function readIntString (signed, buffer, offset, bits, littleEndian, base) {
        var value = [0];

        var byteCount = Math.ceil(bits / 8);
        var bytes = new Array(byteCount);
        var bitsMod8 = bits % 8;
        var i, b, byte, z;
        if (littleEndian) {
            for (i = 0; i < byteCount; i++) {
                bytes[byteCount - i - 1] = buffer[offset + i];
            }
        } else {
            for (i = 0; i < byteCount; i++) {
                bytes[i] = buffer[offset + i];
            }
        }

        signed = signed && !!(bytes[0] & (1 << ((bitsMod8 == 0) ? 7 : (bitsMod8 - 1))));
        if (signed) {
            for (i = 0; i < byteCount; i++) {
                bytes[i] = bytes[i] ^ 0xff;
            }
            plus(value, [1], base);
        }

        for (i = byteCount - 1, b = 0; i >= 0 && b < bits; i--) {
            byte = bytes[i];
            for (z = 0; z < 8 && b < bits; z++, b++) {
                if ((byte & (1 << z))) {
                    plus(value, pow([2], b, base), base);
                }
            }
        }

        return (signed ? '-' : '') + value.reverse().join('');
    };

})();*/

var stringForSubtype = function (subType) {
    switch (subType) {
        case E_SUBTYPE_GENERIC:
            return 'generic';
        case E_SUBTYPE_FUNCTION:
            return 'function';
        case E_SUBTYPE_BINARY_OLD:
            return 'old_binary';
        case E_SUBTYPE_UUID_OLD:
            return 'old_uuid';
        case E_SUBTYPE_UUID:
            return 'uuid';
        case E_SUBTYPE_MD5:
            return 'md5';
        case E_SUBTYPE_USER_DEFINED:
            return 'user_defined';
        default:
            return 'unknown_' + subType;
    }
};

/**
 * @param {Object?} options
 * @param {Boolean=true} options.hasHeader - Does the stream begin with a BSON length header?
 * @param {Boolean=true} options.arrayOfBsons - Try to parse sequential BSONs until data runs out
 * @param {String|Boolean|null} options.preserveInt64='string' - Preserve Int64 when overflowing the JS 53bit limitation.
 *   - `false` - Do not try to preserve (large numbers may be truncated!)
 *   - `'number'` - Always output as numbers. Be careful when you read those!
 *   - `'string'` - Always output as a string.
 *   - `'auto'` - Output as a string when over 53bits, and as a number when possible.
 * @returns {BsonJsonTransform}
 * @constructor
 */
var BsonJsonTransform = function (options) {
    options = options || {};

    var hasHeader = options.hasHeader === undefined || !!options.hasHeader;

    var preserveInt64Opt = typeof options.preserveInt64 === 'string'
        ? options.preserveInt64.toLowerCase()
        : options.preserveInt64;

    var preserveInt64 = preserveInt64Opt === undefined ||
        preserveInt64Opt === true ||
        preserveInt64Opt === 'auto' ||
        preserveInt64Opt === 'number' ||
        preserveInt64Opt === 'string';
    var preserveInt64Number = preserveInt64Opt === 'number';
    var preserveInt64String = preserveInt64Opt === 'string';
    var preserveInt64Auto = preserveInt64 && !preserveInt64Number && !preserveInt64String;

    this._arrayOfBsons = !!options.arrayOfBsons;

    //noinspection JSUndefinedPropertyAssignment
    options.objectMode = true;

    if (!(this instanceof BsonJsonTransform)) {
        return new BsonJsonTransform(options);
    }

    this._bsonCount = 0;

    var state;
    var stack = this._stack = [];

    // Per-type states
    var readingBinary = 0;
    var readingString = false;
    var readingCString = false;

    // Associated data
    var elementType = E_TYPE_DOCUMENT;
    var firstItem;
    var buffer = new Buffer(0);
    var bufferIndex = 0;
    var value;

    this._processChunk = function (chunk) {

        // Accumulate the buffers that arrive
        if (chunk) {
            if (bufferIndex == buffer.length) {
                buffer = chunk;
                bufferIndex = 0;
            } else {
                if (bufferIndex > 10240) {
                    // Trim the buffer if it's too big and we're far enough in
                    buffer = buffer.slice(bufferIndex);
                    bufferIndex = 0;
                }

                buffer = Buffer.concat([buffer, chunk]);
            }
        }

        // Repeat until there's no more we can process and then wait for another chunk
        do {

            if (stack.length === 0) {

                this._bsonCount ++;

                firstItem = true;

                state = {
                    type: E_TYPE_DOCUMENT,
                    length: 0,
                    readingKey: 0,
                    readingValue: false
                };
                stack.push(state);
            }

            // The very first item, is always the main Object
            if (firstItem) {
                if (hasHeader) {
                    if (buffer.length - bufferIndex < 4) return;
                    bufferIndex += 4;
                }

                if (this._arrayOfBsons) {
                    if (this._bsonCount > 1) {
                        this.push(',');
                    } else {
                        this.push('[');
                    }
                }

                this.push('{');
                firstItem = false;
            }

            // Read binary data
            if (readingBinary > 0) {
                value = Math.min(readingBinary, buffer.length - bufferIndex);
                this.push(buffer.toString('hex', bufferIndex, bufferIndex + value));
                bufferIndex += value;
                readingBinary -= value;
                if (readingBinary < 0) {
                    // This should never happen. It's there for debugging
                    this.emit('error', new Error('ParseError: Tried to read too much binary data. Something went wrong.'));
                }

                // If we're still reading binary data, then return as we're waiting for more data
                if (readingBinary > 0) return;

            } else if (readingString !== false) {
                // A "string" is [INT32(size), UTF8 string, null terminator]

                if (readingString === true) {
                    if (buffer.length - bufferIndex < 4) return;

                    // Read size
                    readingString = buffer.readInt32LE(bufferIndex);
                    bufferIndex += 4;
                }

                if (readingString !== true) {
                    if (buffer.length - bufferIndex < readingString) return;

                    // The data is available
                    value = buffer.toString('utf8', bufferIndex, bufferIndex + readingString - 1);

                    bufferIndex += readingString; // Skip the string length, + the null terminator
                    readingString = false;

                    if (buffer[bufferIndex - 1] != 0x00) {
                        this.emit('error', new Error('ParseError: String must end with a null-terminator (0x00).'));
                    }
                }

            } else if (readingCString !== false) {
                // A "cstring" is [UTF8 string, null terminator]
                // No 0x00 allowed in the UTF8, which means it's not a full UTF8 string actually

                var nullPos = buffer.indexOf(0x00, bufferIndex);
                if (nullPos === -1) return;

                value = buffer.toString('utf8', bufferIndex, nullPos);
                bufferIndex = nullPos + 1;
                readingCString = false;
            }

            if (state.readingKey) {
                // Read key of key-value object/array

                if (state.readingKey === 1) {
                    readingCString = true;
                    state.readingKey = 2;
                } else if (state.readingKey === 2 && readingCString === false) {

                    // If we're in an object - write the key down
                    if (state.type === E_TYPE_DOCUMENT) {
                        this.push(JSON.stringify(value) + ':');
                    }

                    state.readingKey = 0;
                    state.readingValue = 1;
                }

            } else if (state.readingValue) {

                switch (elementType) {

                    case E_TYPE_DOUBLE: // [64bit floating point]

                        if (buffer.length - bufferIndex < 8) return;

                        value = buffer.readDoubleLE(bufferIndex);
                        this.push(value.toString());
                        bufferIndex += 8;
                        state.readingValue = false;
                        break;

                    case E_TYPE_STRING: // [string]
                    case E_TYPE_SYMBOL:

                        if (state.readingValue === 1) {
                            readingString = true;
                            state.readingValue = 2;
                        } else if (state.readingValue === 2 && readingString === false) {
                            this.push(JSON.stringify(value));
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_DOCUMENT: // [INT32(size),E-list,0x00]

                        state.readingValue = false;

                        this.push('{');
                        state = {
                            type: elementType,
                            length: 0,
                            readingKey: 0,
                            readingValue: false
                        };
                        stack.push(state);

                        // Expect document size here
                        if (buffer.length - bufferIndex < 4) return;
                        bufferIndex += 4;
                        break;

                    case E_TYPE_ARRAY: // [INT32(size),E-list,0x00]

                        state.readingValue = false;

                        this.push('[');
                        state = {
                            type: elementType,
                            length: 0,
                            readingKey: 0,
                            readingValue: false
                        };
                        stack.push(state);

                        // Expect document size here
                        if (buffer.length - bufferIndex < 4) return;
                        bufferIndex += 4;
                        break;

                    case E_TYPE_BINARY: // [INT32(size),subtype,byte*size]

                        if (state.readingValue === 1) {
                            if (buffer.length - bufferIndex < 5) return;

                            // Size of binary to read
                            readingBinary = buffer.readInt32LE(bufferIndex);
                            bufferIndex += 4;

                            // Subtype
                            value = buffer[bufferIndex++];

                            this.push('{"binary_type":');
                            this.push(stringForSubtype(value));
                            this.push(',"binary_data":"');
                            state.readingValue = 2; // Waiting for binary data
                        } else if (state.readingValue === 2) {
                            this.push('"}');
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_UNDEFINED: // Undefined can't be represented in JSON, and was deprecated.
                    case E_TYPE_NULL:
                    case E_TYPE_MIN_KEY:
                    case E_TYPE_MAX_KEY:

                        this.push('null');
                        state.readingValue = false;
                        break;

                    case E_TYPE_OBJECT_ID: // [byte*12]

                        if (state.readingValue === 1) {
                            readingBinary = 12;
                            this.push('{"object_id":"');
                            state.readingValue = 2; // Waiting for binary data
                        } else if (state.readingValue === 2) {
                            this.push('"}');
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_BOOL: // [0x00 | 0x01]

                        if (buffer.length - bufferIndex < 1) return;
                        value = buffer[bufferIndex++];

                        if (value === 0x00) {
                            this.push('false');
                        } else if (value === 0x01) {
                            this.push('true');
                        } else {
                            this.emit('error', new Error('ParseError: Encountered an unknown boolean value: 0x' + value.toString(16) + '.'));

                            // Fallback
                            this.push('false');
                        }

                        state.readingValue = false;
                        break;

                    case E_TYPE_INT32: // [INT64]

                        if (buffer.length - bufferIndex < 4) return;
                        value = buffer.readInt32LE(bufferIndex);
                        this.push(value.toString());
                        bufferIndex += 4;
                        state.readingValue = false;
                        break;

                    case E_TYPE_INT64_UTC_DATETIME: // [INT64]
                    case E_TYPE_INT64_TIMESTAMP:
                    case E_TYPE_INT64:
                        if (buffer.length - bufferIndex < 8) return;
                        
                        if (preserveInt64) {
                            var value = readInt64String(true, buffer, bufferIndex);
                            if (preserveInt64Number) {
                                this.push(value.toString());
                            } else if (preserveInt64String) {
                                this.push(JSON.stringify(value));
                            } else if (preserveInt64Auto) {
                                var nInt64 = readInt64LE(buffer, bufferIndex);
                                if (nInt64.toString() === value) {
                                    value = nInt64;
                                }
                                this.push(JSON.stringify(value));
                            }
                        } else {
                            value = readInt64LE(buffer, bufferIndex);
                            this.push(value.toString());
                        }

                        bufferIndex += 8;
                        state.readingValue = false;
                        break;

                    case E_TYPE_REGEX: // [cstring(regex), cstring(options)]

                        if (state.readingValue === 1) {
                            readingCString = true;
                            state.readingValue = 2;
                        } else if (state.readingValue === 2 && readingCString === false) {
                            this.push('{"regex":');
                            this.push(JSON.stringify(value));
                            readingCString = true;
                            state.readingValue = 3;
                        } else if (state.readingValue === 3 && readingCString === false) {
                            this.push(',"regex_options":');
                            this.push(JSON.stringify(value));
                            this.push('}');
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_DBPOINTER_DEPRECATED: // [string, byte*12]

                        if (state.readingValue === 1) {
                            readingString = true;
                            this.push('{"db_pointer":');
                            state.readingValue = 2; // Waiting for string data
                        } else if (state.readingValue === 2 && readingString === false) {
                            readingBinary = 12;
                            this.push(',"db_pointer_addr":"');
                            state.readingValue = 3; // Waiting for binary data
                        } else if (state.readingValue === 3 && readingBinary === false) {
                            this.push('"}');
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_JS: // [string]

                        if (state.readingValue === 1) {
                            readingString = true;
                            state.readingValue = 2;
                        } else if (state.readingValue === 2 && readingString === false) {
                            this.push('{"js":');
                            this.push(JSON.stringify(value));
                            this.push('}');
                            state.readingValue = false;
                        }
                        break;

                    case E_TYPE_JS_W_SCOPE: // [INT32(total size), string(code), document(scope)]

                        if (state.readingValue === 1) {
                            readingString = true;
                            state.readingValue = 2;
                        } else if (state.readingValue === 2 && readingString === false) {
                            this.push('{"js":');
                            this.push(JSON.stringify(value));
                            this.push(',"js_scope":');

                            // Now read a document.
                            // This element ends with a document,
                            //   so we do not need to continue tracking state of the JS_W_SCOPE.
                            elementType = E_TYPE_DOCUMENT;
                            state.readingValue = 1;
                        }
                        break;
                }

            } else {

                if (buffer.length - bufferIndex < 1) return;

                elementType = buffer[bufferIndex++];

                if (elementType === E_TYPE_ENDOBJECT) {
                    // End of object

                    var last = stack.pop();
                    if (last.type === E_TYPE_DOCUMENT) {
                        this.push('}');
                    } else if (last.type === E_TYPE_ARRAY) {
                        this.push(']');
                    } else {
                        this.emit('error', new Error('ParseError: Unexpected end-of-object encountered.'));
                    }

                    if (stack.length === 0) {
                        if (!this._arrayOfBsons) {
                            if (buffer.length - bufferIndex > 0) {
                                this.emit('error', new Error('ParseError: More data is available after end-of-object.'));
                                return;
                            }
                        }
                    } else {
                        state = stack[stack.length - 1];
                    }

                } else {

                    if ((elementType >= 0x01 && elementType <= 0x12) ||
                        elementType === 0xFF || elementType === 0x7F) {

                        if (state.length) {
                            this.push(',');
                        }
                        state.length++;

                        state.readingKey = 1;
                    } else {
                        this.emit('error', new Error('ParseError: Encountered an unknown element type: 0x' + elementType.toString(16) + '.'));
                    }
                }
            }

        } while (buffer.length - bufferIndex > 0);

    };

    Transform.call(this, options);
};

Util.inherits(BsonJsonTransform, Transform);

//noinspection JSUnusedGlobalSymbols
BsonJsonTransform.prototype._transform = function (chunk, enc, cb) {

    if (this._stack.length === 0 && !this._arrayOfBsons) {
        this.emit('error', new Error('ParseError: More data is available after end-of-object.'));
        return cb();
    }

    this._processChunk(chunk);

    cb();
};

//noinspection JSUnusedGlobalSymbols
BsonJsonTransform.prototype._flush = function (cb) {

    this._processChunk();

    if (this._arrayOfBsons
        && this._stack.length === 1
        && this._stack[0].length === 0
        && this._stack[0].readingKey === 0
        && this._stack[0].readingValue === false) {
        this._stack.pop();
    }

    if (this._stack.length === 0) {
        // We have a complete BSON.

        if (this._arrayOfBsons) {
            // We're in a virtual array, close it
            if (this._bsonCount === 0) {
                this.push('[');
            }
            this.push(']');
        } else if (this._bsonCount === 0) {
            this.emit('error', new Error('ParseError: No data was available.'));
        }

    } else {
        this.emit('error', new Error('ParseError: BSON object incomplete.'));
    }

    cb();
};

/**
 * @module
 * @type {BsonJsonTransform}
 */
module.exports = BsonJsonTransform;