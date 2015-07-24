/// <reference path="type_declarations/index.d.ts" />
var pako = require('pako');
// window['pako'] = pako;
// import _ from 'lodash';
var angular = require('angular');
require('ngstorage');
var httprequest_1 = require('httprequest');
/** cross-vendor compatibility */
function getUserMedia(constraints, successCallback, errorCallback) {
    var vendorGetUserMedia = navigator['getUserMedia'] || navigator['webkitGetUserMedia'] ||
        navigator['mozGetUserMedia'] || navigator['msGetUserMedia'];
    return vendorGetUserMedia.call(navigator, constraints, successCallback, errorCallback);
}
/**
A VideoCapture instance creates an off-screen canvas for rendering video.
*/
var VideoCapture = (function () {
    function VideoCapture(type, quality) {
        if (type === void 0) { type = 'image/jpeg'; }
        if (quality === void 0) { quality = 0.9; }
        this.type = type;
        this.quality = quality;
    }
    /**
    Use the internal canvas to render the video to the desired image format,
    returning a DataURL string. It will initialize the canvas and context with the
    given video element's size when first called.
    */
    VideoCapture.prototype.render = function (video) {
        // console.time('VideoCapture#render');
        if (this.canvas === undefined) {
            this.canvas = document.createElement('canvas');
            this.width = this.canvas.width = video.width;
            this.height = this.canvas.height = video.height;
            this.context = this.canvas.getContext('2d');
        }
        this.context.drawImage(video, 0, 0, this.width, this.height);
        // Canvas#toDataURL(type, encoderOptions)
        //   type: a string indicating an image MIME type
        //   encoderOptions: a number from 0 to 1 indicating image quality
        var image_data_url = this.canvas.toDataURL(this.type, this.quality);
        // console.timeEnd('VideoCapture#render');
        return image_data_url;
    };
    return VideoCapture;
})();
var jpeg_capture = new VideoCapture('image/jpeg', 0.6);
var Recorder = (function () {
    function Recorder(video, frames_per_second) {
        if (frames_per_second === void 0) { frames_per_second = 30; }
        this.video = video;
        this.frames = [];
        this.durations = [];
        this.recording = false;
        this.ms_per_frame = 1000 / frames_per_second;
    }
    Recorder.prototype.capture = function (timestamp) {
        var _this = this;
        // just return if we're not recording
        if (!this.recording)
            return;
        // first step: schedule the next iteration of the loop
        requestAnimationFrame(function (timestamp) { return _this.capture(timestamp); });
        // decide if it's time to draw
        var elapsed_since_last_draw = timestamp - this.last_capture;
        // console.log('elapsed_since_last_draw', elapsed_since_last_draw);
        if (elapsed_since_last_draw > this.ms_per_frame) {
            this.last_capture = timestamp - (elapsed_since_last_draw % this.ms_per_frame);
            var frame = jpeg_capture.render(this.video);
            // this will push the captured frame into slot [i], but will push the new
            // duration into slot [i - 1], which makes sense, since we don't know how
            // long a frame should last until we get to the next one.
            this.frames.push(frame);
            this.durations.push(elapsed_since_last_draw);
        }
    };
    Recorder.prototype.start = function () {
        var _this = this;
        console.log('Recorder#start');
        this.recording = true;
        // stick a frame on the stack and kick off the capture loop
        var frame = jpeg_capture.render(this.video);
        this.last_capture = window.performance.now();
        this.frames.push(frame);
        requestAnimationFrame(function (timestamp) { return _this.capture(timestamp); });
    };
    Recorder.prototype.stop = function () {
        console.log('Recorder#stop');
        this.recording = false;
        var elapsed_since_last_draw = window.performance.now() - this.last_capture;
        this.durations.push(elapsed_since_last_draw);
        var total_length = this.frames.map(function (frame) { return frame.length; }).reduce(function (a, b) { return a + b; }, 0);
    };
    return Recorder;
})();
var app = angular.module('app', ['ngStorage']);
function px(length, fractionDigits) {
    if (fractionDigits === void 0) { fractionDigits = 3; }
    return length ? (length.toFixed(fractionDigits) + 'px') : length;
}
app.filter('px', function () { return px; });
function pct(fraction, fractionDigits) {
    if (fractionDigits === void 0) { fractionDigits = 1; }
    return fraction ? ((100 * fraction).toFixed(fractionDigits) + '%') : fraction;
}
app.filter('pct', function () { return pct; });
app.controller('signController', function ($scope, $timeout, $interval, $localStorage) {
    $scope.$storage = $localStorage;
    MediaStreamTrack.getSources(function (sourceInfos) {
        $timeout(function () {
            $scope.sources = sourceInfos;
        });
    });
    var video = document.querySelector('video');
    // http://src.chromium.org/svn/trunk/src/chrome/test/data/webrtc/manual/constraints.html
    getUserMedia({
        video: {
            mandatory: {
                minWidth: 640,
                minHeight: 480,
                maxWidth: 640,
                maxHeight: 480,
            }
        }
    }, function getUserMediaSuccessCallback(mediaStream) {
        // console.log('Initialized video MediaStream', mediaStream);
        var stream_url = URL.createObjectURL(mediaStream);
        // console.log('Created ObjectURL "%s" from MediaStream', stream_url);
        video.src = stream_url;
    }, function getUserMediaErrorCallback(mediaStreamError) {
        console.error('Failed to initialize MediaStream: %s', mediaStreamError);
    });
    var recorder = $scope.recorder = new Recorder(video, 30);
    $scope.startCapture = function () {
        recorder = $scope.recorder = new Recorder(video, 30);
        // window['recorder'] = recorder;
        recorder.start();
    };
    $scope.stopCapture = function () {
        recorder.stop();
    };
    $scope.sign = {
        gloss: 'test',
        description: '',
        nframes: 0,
        blob: { size: 0 },
        framerate: 0,
    };
    var highlight_img = document.getElementById('highlight');
    var highlight_img_src = '';
    $scope.setHighlight = function (index) {
        // console.log('videoController:setHighlight', index, recorder.frames[index]);
        var new_img_src = recorder.frames[index];
        if (highlight_img_src !== new_img_src && new_img_src) {
            highlight_img_src = highlight_img['src'] = new_img_src;
        }
    };
    $scope.setFrames = function (frames) {
        // console.log('setting frames', frames);
        $scope.sign.nframes = frames.length;
        var avg_ms_per_frame = recorder.durations.reduce(function (a, b) { return a + b; }, 0) / recorder.durations.length;
        // convert from ms per frame to frames per second
        $scope.sign.framerate = 1000 / avg_ms_per_frame;
        // var binary_images = frames.map(function(frame) { return atob(frame.slice(23)); });
        var imagedata = frames.join('\n');
        var imagedata_z = pako.deflate(imagedata);
        $scope.sign.blob = new Blob([imagedata_z], { type: 'application/octet-stream' });
    };
    var server = 'https://localhost/signs-server';
    $scope.submit = function () {
        var url = server + '/signs';
        console.log('requesting url', url);
        var request = new httprequest_1.Request('POST', url);
        request.addHeader('x-sign-gloss', $scope.sign.gloss);
        request.addHeader('x-sign-description', $scope.sign.description);
        request.addHeader('x-framerate', $scope.sign.framerate);
        request.sendData($scope.sign.blob, function (error, response) {
            console.log('request done', error, response);
        });
    };
});
app.directive('filmstrip', function () {
    return {
        restrict: 'E',
        template: "\n      <div style=\"position: relative\" ng-style=\"{height: (height | px)}\">\n        <span ng-repeat=\"keyframe in keyframes track by $index\"\n              style=\"position: absolute\" ng-style=\"{left: (keyframe.left | px)}\">\n          <img class=\"keyframe\" ng-src=\"{{keyframe.src}}\" ng-style=\"{width: (width | px), height: (height | px)}\">\n        </span>\n        <span class=\"selection\" ng-style=\"{position: 'absolute', height: (height | px),\n          left: (start_frame * pixels_per_frame | px),\n          width: ((end_frame - start_frame) * pixels_per_frame | px)}\">\n          &nbsp;\n        </span>\n      </div>\n    ",
        scope: {
            width: '=',
            height: '=',
            frames: '=',
            setHighlight: '&',
            setFrames: '&',
        },
        link: function (scope, el, attrs) {
            var element = el[0];
            var bounds = element.getBoundingClientRect();
            // console.log('bounds:', bounds);
            var n_keyframes = bounds.width / scope.width;
            var keyframe_offset = scope.width * n_keyframes / (n_keyframes | 0);
            scope.$watchCollection('frames', function () {
                var frames = scope.frames || [];
                var take_every_nth_keyframe = frames.length / n_keyframes;
                scope.pixels_per_frame = bounds.width / frames.length;
                scope.keyframes = new Array(n_keyframes | 0);
                for (var i = 0; i < (n_keyframes | 0); i++) {
                    scope.keyframes[i] = {
                        src: frames[i * take_every_nth_keyframe | 0],
                        left: i * keyframe_offset,
                    };
                }
                // reset selection
                scope.start_frame = 0;
                scope.stop_frame = frames.length - 1;
            });
            var elementOffsetX = element.offsetLeft - element.offsetParent.scrollLeft;
            function overFrame(ev) {
                var offsetX = ev.clientX - elementOffsetX;
                return (offsetX / bounds.width) * scope.frames.length | 0;
            }
            var mousedown = false;
            el.on('mousedown', function (ev) {
                mousedown = true;
                scope.$apply(function () {
                    scope.start_frame = scope.end_frame = overFrame(ev);
                });
            });
            el.on('mouseup', function (ev) {
                scope.$apply(function () {
                    scope.setFrames({ frames: scope.frames.slice(scope.start_frame, scope.end_frame + 1) });
                    mousedown = false;
                });
            });
            el.on('mousemove', function (ev) {
                scope.setHighlight({ index: overFrame(ev) });
                if (mousedown) {
                    scope.$apply(function () {
                        // don't allow selecting before the start frame
                        scope.end_frame = Math.max(scope.start_frame, overFrame(ev));
                    });
                }
            });
        }
    };
});
