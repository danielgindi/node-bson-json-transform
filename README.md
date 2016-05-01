# bson-json-transform

[![npm Version](https://badge.fury.io/js/bson-json-transform.png)](https://npmjs.org/package/bson-json-transform)

A Node.js Transform for streaming Bson into Json.  
With this you can convert a large BSON to a JSON without exchausting your available RAM.

## Included features: (can be turned on and off)

* Parse all BSON features as a stream.
* Option to skip first BSON "total size" header.

## Installation:

```
npm install --save bson-json-transform
```

The options you can pass are:

Name | Type | Default | Explanation
---- | ---- | ------- | -----------
  `hasHeader` | `Boolean` | `true` | Does the stream begin with a BSON length header?
  `arrayOfBsons` | `Boolean` | `false` | Try to parse sequential BSONs until data runs out
  `preserveInt64` | `String|Boolean|null` | `true` | Preserve `Int64` when overflowing the JS 53bit limitation.<br />- `false` - Do not try to preserve (large numbers may be truncated!)<br />- `'number'` - Always output as numbers. Be careful when you read those!<br />- `'string'` - Always output as a string.<br />- `'auto'` - Output as a string when over 53bits, and as a number when possible.

  
## Usage example:

```javascript

var fs = require('fs');
var BsonJsonTransform = require('bson-json-reader');

fs
	.createReadStream('my_data.bson')
	.pipe(BsonJsonTransform({ preserveInt64: 'string' }))
	.pipe(fs.createWriteStream('my_data.json'))
	.on('end', function (data) {
	    console.log('No more data!');
	});

```

## Contributing

If you have anything to contribute, or functionality that you lack - you are more than welcome to participate in this!
If anyone wishes to contribute unit tests - that also would be great :-)

## Me
* Hi! I am Daniel Cohen Gindi. Or in short- Daniel.
* danielgindi@gmail.com is my email address.
* That's all you need to know.

## Help

If you want to buy me a beer, you are very welcome to
[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G6CELS3E997ZE)
 Thanks :-)

## License

All the code here is under MIT license. Which means you could do virtually anything with the code.
I will appreciate it very much if you keep an attribution where appropriate.

    The MIT License (MIT)

    Copyright (c) 2013 Daniel Cohen Gindi (danielgindi@gmail.com)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
