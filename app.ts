/// <reference path="type_declarations/index.d.ts" />

declare var MediaStreamTrack;
declare var Whammy;

// import _ from 'lodash';
import angular = require('angular');
import 'ngstorage';
// import {Request} from 'httprequest';

/** cross-vendor compatibility */
function getUserMedia(constraints, successCallback, errorCallback) {
  var vendorGetUserMedia = navigator['getUserMedia'] || navigator['webkitGetUserMedia'] ||
    navigator['mozGetUserMedia'] || navigator['msGetUserMedia'];
  return vendorGetUserMedia.call(navigator, constraints, successCallback, errorCallback);
}

var app = angular.module('app', ['ngStorage']);

app.controller('videoController', ($scope, $timeout, $interval, $localStorage) => {
  $scope.$storage = $localStorage;

  MediaStreamTrack.getSources(function(sourceInfos) {
    $timeout(function() {
      $scope.sources = sourceInfos;
    });
  });

  var video = <HTMLVideoElement>document.querySelector('video');
  // http://src.chromium.org/svn/trunk/src/chrome/test/data/webrtc/manual/constraints.html
  getUserMedia({
    video: {
      mandatory: {
        minWidth: 640,
        minHeight: 480,
        maxWidth: 640,
        maxHeight: 480,
        // minFrameRate: 60,
        // maxAspectRatio
      }
    }
  }, function getUserMediaSuccessCallback(mediaStream) {
    console.log('Initialized video MediaStream', mediaStream);
    var stream_url = URL.createObjectURL(mediaStream);
    // console.log('Created ObjectURL "%s" from MediaStream', stream_url);
    video.src = stream_url;
  }, function getUserMediaErrorCallback(mediaStreamError) {
    console.log('Failed to initialize MediaStream: %s', mediaStreamError);
  });

  var mediaCanvas = $scope.mediaCanvas = new MediaCanvas(video, video.width, video.height, 'image/webp');
  $scope.startCapture = function() {
    mediaCanvas.startCapture();
  };
  $scope.stopCapture = function() {
    var a = <HTMLAnchorElement>document.querySelector('a[download]');
    a.href = mediaCanvas.stopCapture();
  };
  $interval(() => {
    $scope.framecount = mediaCanvas.frames.length;
  }, 100)
});

class MediaCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  capturing = false;
  frames: string[] = [];
  constructor(private video: HTMLVideoElement,
              private width: number = video.width,
              private height: number = video.height,
              private type: string = 'image/webp') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = <CanvasRenderingContext2D>this.canvas.getContext('2d');
  }

  private addFrame() {
    // console.log('addFrame video=%o 0,0 %s,%s', this.video, this.width, this.height);
    this.context.drawImage(this.video, 0, 0, this.width, this.height);
    // Canvas#toDataURL(type, encoderOptions)
    //   type: a string indicating an image MIME type
    //   encoderOptions: a number from 0 to 1 indicating image quality
    var quality = 0.5;
    var url = this.canvas.toDataURL(this.type, quality);
    console.log(`Rendered canvas toDataURL(${this.type}, ${quality})`, url.length);
    this.frames.push(url);

    if (this.capturing) {
      requestAnimationFrame(() => this.addFrame());
    }
  }

  startCapture() {
    this.capturing = true;
    this.addFrame();
  }

  stopCapture(): string {
    // https://github.com/antimatter15/whammy
    this.capturing = false;
    return '';
    // var webm_blob = Whammy.fromImageArray(this.frames, 1000 / 60);
    // console.log('Created webm blob', webm_blob);
    // var webm_url = URL.createObjectURL(webm_blob);
    // return webm_url;
    // var encoder = new Whammy.Video(1000/60);
    // frames.forEach(function(dataURL, i) {
    //   encoder.add(dataURL);
    // });
    // var webmBlob = encoder.compile();
  }
}
