/**
 * Bacterial Reference Annotation Genome Viewer
 * @namespace BRAGV
 */
var BRAGV = {};


var debug = false;

/**
 * The viewer object that contains all the elements of BRAGV
 * @param {string} divName
 * @constructor
 * @memberOf BRAGV
 */
BRAGV.Viewer = function(divName, conf)
{
	this.selectThreshold = 5;
	this.showlabels = false;
	/**
	 * id the plugin being used to provide an overview of the whole sequence?
	 */
	this.overview = false;
	if(conf && conf['overview']) this.overview = conf.overview;
	/**
	 * the first displayed base
	 */
	this.offset = 0;
	/**
	 * How many bases are being displayed
	 */
	this.numBases = 0;
	/**
	 * how many ticks should be shown
	 *
	 */
	this.numTicks = 10;
	/**
	 * The length of the chromosome
	 */
	this.c_length = 1000000;

	/**
	 * how many pixels high each track should be.
	 */
	this.trackheight = 20;
	/**
	 * how many pixels separation there should be between the tracks
	 */
	this.padding = 3;
	this.totalTrackHeight = this.trackheight + this.padding;
	this.lastDraw = 0;
	/**
	 * The first base being displayed by the viewer
	 */
	this.start = 0;
	/**
	 * The last base being displayed by the viewer
	 */
	this.end = 0;

	/**
	 * the first base being selected
	 */
	this.selection_start = null;
	/**
	 * the last base selected
	 */
	this.selection_end = null;

	this.tracks = {};
	this.trackIndex = [];

	this.forwardTracks = [];
	this.reverseTracks = [];

	this.labelWidth = 40.0;
	this.selectedColour = 'rgba(0, 255, 255, 1)';

	/**
	 * The first base in the selection (Null if no bases are selected)
	 */
	this.firstSelectedBase = null;
	/**
	 * The last base in the selection (Null if no bases are selected)
	 */
	this.lastSelectedBase = null;

	var div = $(document.getElementById(divName));

	var w = div.innerWidth() - 26;
	var h = div.innerHeight() - 8;
	//div.css('position', 'relative');
	/**
	 * An array containing the track id and the index of the selected feature;
	 */
	this.selectedFeature = [null, null, null];

	div.append('<canvas id="'+ divName + '_Viewer" width="'+w+'" height="'+h+'" class="bragv_canvas"></canvas>');

	this.div = div;
	this.canvas = $('canvas', div)[0];

	this.ctx = this.canvas.getContext('2d');

	this.baseWidth = (w - this.labelWidth) / this.numBases;
	this.trackWidth = w - this.labelWidth;
	var vwr = this;

	if(!this.overview)
	{
		this.horizontalScroller = new BRAGV.Scroller(divName, 'h',{min : 0,max : (this.c_length - this.numBases), step :this.numBases / 4 });
		this.verticalScroller = new BRAGV.Scroller(divName, 'v', {min:0, max: 8, step : 1 });

		this.horizontalScroller.onValueChange = function(val)
		{
			vwr.setOffset(val);
		};
		this.horizontalScroller.onDrop = function(val){
			vwr.draw();
		};
		this.verticalScroller.onValueChange = function(val)
		{
			vwr.setZoom(val);
		};
		this.verticalScroller.onDrop = function(val){
			vwr.draw();
		};
	}
	$('canvas', div).click(function(evt){

		if(vwr.preventClick)
		{
			vwr.preventClick = false;
			return;
		}

		var offset = $(evt.target).offset();

		var x = evt.clientX - offset.left;
		var y = evt.clientY - offset.top;


		if(x > (vwr.showLabels ?  vwr.labelWidth : 10))
		{

			var t = vwr.getTrackAt(x,y);

			if(!t) return;

			var b = vwr.getBaseAt(x,y);

			var tup = vwr.getFeatureByTrackAndBase(t, b);

			vwr.selectedFeature = [t, tup.index, tup.features];
/**
 * @name Viewer#trackClicked
 * @event
 * @memberOf BRAGV
 * @param {Object} eventData (track, base, feature,	 featureIndex)
 */
			div.trigger({
				type: 'trackClicked',
				track : t,
				base : b,
				feature : tup.feature,
				featureIndex : tup.index,
				feature_list : tup.features
			});

			vwr.draw();

		}
	});


	$('canvas', div).mousedown(function(evt){
		var off = $(evt.target).offset();
		if(vwr.getTrackAt(evt.clientX-off.left, evt.clientY-off.top) > vwr.trackIndex.length) return;
		vwr.selectStart = evt.clientX - off.left;
		vwr.selection_start = null;
		vwr.selection_end = null;
	});
	$('canvas', div).mousemove(function(evt){
		if(vwr.selectStart){
            var end = (evt.clientX - $(evt.target).offset().left);
            var dist = Math.abs(end - vwr.selectStart);
            if(dist > vwr.selectThreshold)
            {
                vwr.preventClick = true;
                vwr.selection_end = vwr.getBaseAt(end, 0);
                vwr.selection_start = vwr.getBaseAt(vwr.selectStart, 0);
                vwr.draw();
            }
        } else {
            var offset = $(evt.target).offset();

		  var x = evt.clientX - offset.left;
		  var y = evt.clientY - offset.top;
            var t = vwr.getTrackAt(x,y);

			if(!t) return;

			var b = vwr.getBaseAt(x,y);

			var tup = vwr.getFeatureByTrackAndBase(t, b);

            div.trigger({
                type : "feature_rollover",
                track: t,
                base : b,
                feature : tup.feature,
                mouse_position : [evt.clientX, evt.clientY]
            });
        }
	});
	$('canvas', div).mouseup(function(evt){
		vwr.selectStart = null;
		if(vwr.selection_end === null) return;
		vwr.draw();
		div.trigger({
			type: 'region_selected',
			startbase: vwr.selection_start,
			endbase : vwr.selection_end
		});
	});
};

BRAGV.Viewer.prototype = {
		addSequenceToTrack : function(trackName, seq, type)
		{
			if(type && type == 'amino_acid')
			{
				this.aaseq = seq;
				this.drawAminoAcids();
			}
			else
			{//assume DNA
				if(this.forwardTracks.length < 4 || this.reverseTracks.length < 4 ) this.addTrack('SEQ', true);
				this.seq = seq;
				this.drawBases();
			}
		},
		addTrack : function(trackName, include_reverse)
		{
			var fTrack = new BRAGV.Track(trackName + '_f');
			if(include_reverse !== false)
			{
				var rTrack = new BRAGV.Track(trackName + '_r');
				rTrack.isReverse = true;
				this.trackIndex[this.trackIndex.length] = rTrack.name;
				this.reverseTracks[this.reverseTracks.length] = rTrack.name;
				this.tracks[rTrack.name] = rTrack;
			}

			this.trackIndex[this.trackIndex.length] = fTrack.name;
			this.forwardTracks[this.forwardTracks.length] = fTrack.name;
			this.tracks[fTrack.name] = fTrack;

		},
		addTracks : function(obj)
		{
			for(var i = 0; i < 6; i++)
			{
				this.c_length = Math.max(obj.chromosome_length, this.c_length);
				var id = ((i % 3) + 1) + '_' + (i < 3 ? '1' : - 1);

				if(!this.tracks[id])this.tracks[id] = new BRAGV.Track(id);
				this.tracks[id].isReverse = i > 2;
				this.trackIndex[this.trackIndex.length] = id;

				if(this.tracks[id].isReverse)
				{
					this.reverseTracks[i % 3] = id;
				}
				else
				{
					this.forwardTracks[i % 3] = id;
				}
			}

			var flist = obj.feature_list;
			var n_features = flist.length;

			for(var n = n_features; n--;)
			{
				var feat = flist[n];
				if(!feat['sub_features'] || feat.sub_features.length == 0)
				{
					this.tracks[feat['frame'] + '_' + feat['strand']].features.push(feat);
				}
				else
				{

					for(var sf = 0; sf < feat.sub_features.length; sf++)
					{
						var sub_f = $.extend(true, {}, feat);
						sub_f.start = feat.sub_features[sf].start;
						sub_f.end = feat.sub_features[sf].end;
						sub_f.frame = (sub_f.start % 3) + 1;
						sub_f.subEle = true;
						sub_f.sub_features = false;
						if(sf < feat.sub_features.length - 1)
						{
							var next_sf_st = feat.sub_features[sf+1].start;
							sub_f.linkto = { frame : (next_sf_st % 3) + 1, base : next_sf_st };
						}
						if(sf > 0)
						{
							var prev_sf_st = feat.sub_features[sf-1].start;
							sub_f.linkfrom = { frame : (prev_sf_st % 3) + 1, base : prev_sf_st };
						}

						this.tracks[sub_f.frame + '_' + sub_f.strand].features.push(sub_f);
					}

				}
			}

			if(!this.overview)
			{
				this.horizontalScroller.max = this.numBases;
			}

//			this.horizontalScroller.setMax(this.c_length-this.numBases);
			this.setZoom(1);
			this.draw();
		},
		draw : function()
		{
			var thisDraw = new Date().getTime();
			this.lastdraw = thisDraw;

			if(this.base_req) this.base_req.abort();
			if(this.aa_req) this.aa_req.abort();

			this.resetViewer(thisDraw);
			this.drawTracks(this.trackWidth, thisDraw);
			this.drawTicks(thisDraw);

			if(this.selection_end) this.drawSelection();

			if(this.canvas.offsetParent && this.canvas.offsetParent.id == this.canvas.id.replace('_Viewer', ''))
				$(this.canvas.offsetParent).height((this.trackIndex.length + 5) * this.trackheight);

			this.draw_slow();
		},
		draw_slow : function(reload)
		{
			if(this.numBases <= 100)
			{
				var ctx = this;
				if(reload == undefined || reload)
				{
					this.base_req = $.ajax({
						url: this.refUrl + "/sequence",
						data : {start : this.offset, end : this.offset+this.numBases},
						success : function(data){
							//seq = JSON.parse(data);
							ctx.addSequenceToTrack('', data, 'DNA');

						}
					});
					this.aa_req = $.ajax({
						url: this.refUrl + "/amino_acids",
						data : {start : this.offset, end : this.offset+this.numBases},
						success : function(data){
							//seq = JSON.parse(data);

							ctx.addSequenceToTrack('', data, 'amino_acid');
						}
					});
				}
				else
				{
					ctx.drawBases();
					ctx.drawAminoAcids();
				}
			}
		},
		drawTicks : function(thisDraw)
		{
			if(thisDraw < this.lastDraw) return;

			var end = this.trackWidth + 10 - (this.showlabels ? 10 : this.labelWidth);

			var basesPerTick =  Math.round(this.numBases / this.numTicks);

			this.ctx.fillStyle = 'rgba(0,0,0,1)';

			var topy = (this.forwardTracks.length + 1) * this.trackheight;
			var bottomy = topy + (this.trackheight/2);

			this.ctx.strokeStyle = 'rgba(0,0,0,1)';

			for(var i = 0; i <= this.numBases; i = i + basesPerTick)
			{
				var xpos = (this.showlabels ? this.labelWidth : 10) + (i * this.baseWidth);
				this.ctx.beginPath();
				//this.ctx.moveTo(xpos, topy);
				//this.ctx.lineTo(xpos, bottomy);
				//this.ctx.stroke();
				this.ctx.fillRect(xpos, topy, -this.baseWidth, bottomy - topy);

				var txt = (this.offset + i).toString();
				var wt = this.ctx.measureText(txt).width;
				this.ctx.fillText(txt, xpos-wt, topy);
			}


		},
		drawBases : function()
		{
			if(this.numBases > 200) return;

			var ft = this.forwardTracks.length; // inner forward track
			var rt = this.forwardTracks.length + 2; // inner reverse track

			var ftracky  = ((ft) * (this.trackheight + this.padding)) - this.padding;
			var rtracky =  ((rt) * (this.trackheight + this.padding)) - this.padding;

			var limit = Math.min(this.numBases, this.seq.forward.length, this.seq.reverse.length);

			var lpadding = (this.showlabels ? this.labelWidth : 10);

				for(var i = 0; i < limit; i++)
				{
					var xpos = lpadding + (i * this.baseWidth);
					this.ctx.fillText(this.seq.forward[i], xpos, ftracky);
					//this.ctx.fillText(this.seq.reverse[i], xpos, rtracky);
				}

		},
		drawAminoAcids : function()
		{
			if(this.numBases > 200) return;
			var limit = Math.min(this.numBases, this.aaseq.forward[0].length, this.aaseq.reverse[0].length);

			var lpadding = (this.showlabels ? this.labelWidth : 10);

			var rtoffset = this.forwardTracks.length + 1 + (this.reverseTracks.length - 3);

			for(var f = 0; f < 3; f++) // for each frame
			{
				var aftracky = ((f+1) * (this.trackheight + this.padding)) - this.padding;
				var artracky = ((f+1 + rtoffset) * (this.trackheight + this.padding)) - this.padding;

				for(var i = 0; i < limit; i++)
				{
					var fxpos = lpadding + (((i * 3) + f)  * this.baseWidth );
					var rxpos = lpadding + (((i * 3) + (3 - f - 1))  * this.baseWidth );
					if(this.aaseq.forward[f][i]) this.ctx.fillText(this.aaseq.forward[f][i], fxpos, aftracky);
					if(this.aaseq.reverse[f][i]) this.ctx.fillText(this.aaseq.reverse[f][i], rxpos, artracky);
				}

			}

		},
		drawSelection : function()
		{
			var start = (this.showlabels ? this.labelWidth : 10) + ((this.selection_start - this.offset) * this.baseWidth);
			var end = (this.showlabels ? this.labelWidth : 10) + ((this.selection_end - this.offset)* this.baseWidth);
			var width = end-start;

			this.ctx.fillStyle = 'rgba(80,80,80,0.3)';
			this.ctx.fillRect(start, 0, width, this.totalTrackHeight * (this.trackIndex.length + 1)); // height (last arg) is total tracks ( + 1 for tick strip) * height and padding.
		},
		drawTracks : function(w, thisDraw)
		{
			var i = 0;

			var labelWidth = this.showlabels ? this.labelWidth : 10;

			w = w - this.trackheight;
			var fl = this.forwardTracks.length;
			for(; i < fl; i++)
			{
				this.drawTrack(this.forwardTracks[i], i, w, labelWidth, thisDraw);
			}
			i++;
			var bl = this.reverseTracks.length;
			for(var ri = bl; ri--;)
			{
				this.drawTrack(this.reverseTracks[ri], i, w, labelWidth, thisDraw);
				i++;
			}
		},
		drawTrack : function(track, position, width, labelWidth, thisDraw)
		{
			var i = position;
			var w = width;
			var t = track;

			if(thisDraw < this.lastDraw) return;
			var tracky  = (i*(this.trackheight + this.padding)) + this.padding;
			var isReverse = this.tracks[t].isReverse;
			if(this.showlabels)
			{
				this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
				this.ctx.fillText(t, 5, ++i * (this.trackheight + this.padding) -10);
			}

			this.ctx.fillStyle = 'rgba(80, 80, 80, 0.1)';
			this.ctx.fillRect(labelWidth, tracky, w, this.trackheight);

			this.lastpos = 0;
			var features = this.tracks[t].features;
			var count = features.length;

			this.baseWidth = w / this.numBases;

			for(var j = 0; j != count; j++)
			{
				/*if(!features[j].sub_features || features[j].sub_features.length == 0)
				{*/
				var feat = features[j];

				if(thisDraw < this.lastDraw) return;
				if(features[j].start > this.offset + this.numBases) continue;
				if(features[j].end < this.offset) continue;

				this.ctx.strokeStyle = (features[j].subEle ? 'rgba(0,90,127,0.5)' : 'rgba(0,0,0,0.3)');

				var start = labelWidth + (Math.max((features[j].start - this.offset) * this.baseWidth, 0));
				var width = (Math.min(features[j].end, this.numBases + this.offset) - Math.max(this.offset, features[j].start)) * this.baseWidth;

				if(!features[j].colour)
				{
					this.ctx.fillStyle = 'rgba(255, 0, 0, 1)';
				}
				else
				{
					this.ctx.fillStyle = features[j].colour;
				}

				var sel_feats = this.selectedFeature[2];

				for(var x = 0; sel_feats && x < sel_feats.length; x++)
				{
					if(features[j].start == sel_feats[x].start && features[j].end == sel_feats[x].end && features[j].strand == sel_feats[x].strand)
					{
						this.ctx.fillStyle = this.selectedColour;
					}
				}

				this.ctx.fillRect(start, tracky, width, this.trackheight);
				this.ctx.strokeRect(start, tracky, width, this.trackheight);

				if(feat['linkto'])
				{
					var next_start = labelWidth + (Math.max((feat.linkto.base - this.offset) * this.baseWidth, 0));
					var t;
					if(feat.strand == 1)
					{
						t = feat.linkto.frame - 1;
					}
					else
					{
						t = (this.trackIndex.length - feat.linkto.frame) + 1;
					}
					var next_frame = t;
					var end = start + width;
					var half_h = tracky + (this.trackheight / 2);
					var nxtracky  = (next_frame * (this.trackheight + this.padding)) + this.padding;
					var half_nxh = nxtracky + (this.trackheight / 2);
					var gap_width = next_start - end;

					this.ctx.beginPath();
					this.ctx.moveTo(end, half_h);
					//this.ctx.bezierCurveTo(prev_end + (gap_width * 0.2), tracky, prev_end + (gap_width * 0.8), tracky + this.trackheight, start, half_h);

					this.ctx.lineTo(end + (gap_width * 0.2), tracky);
					this.ctx.lineTo(end + (gap_width * 0.8), nxtracky + this.trackheight);
					this.ctx.lineTo(next_start, half_nxh);
					this.ctx.stroke();
				}
			}

			this.ctx.fillStyle = 'rgba(200, 200, 200, 1)';
			this.ctx.beginPath();
			if(isReverse)
			{
				this.ctx.moveTo(labelWidth, tracky);
				this.ctx.lineTo(labelWidth * 0.7, tracky + (this.trackheight * .5));
				this.ctx.lineTo(labelWidth, tracky + this.trackheight);
				this.ctx.closePath();
				this.ctx.fill();

				this.ctx.beginPath();
				var x = labelWidth + w;
				this.ctx.moveTo(x, tracky);
				this.ctx.lineTo(x - labelWidth * 0.3, tracky + (this.trackheight * .5));
				this.ctx.lineTo(x, tracky + this.trackheight);
				this.ctx.closePath();
				this.ctx.fill();
			}
			else
			{
				this.ctx.moveTo(labelWidth, tracky);
				this.ctx.lineTo(labelWidth * 1.3, tracky + (this.trackheight * .5));
				this.ctx.lineTo(labelWidth, tracky + this.trackheight);
				this.ctx.closePath();
				this.ctx.fill();

				this.ctx.beginPath();
				var x = labelWidth + w;
				this.ctx.moveTo(x, tracky);
				this.ctx.lineTo(x + labelWidth * 0.3, tracky + (this.trackheight * .5));
				this.ctx.lineTo(x, tracky + this.trackheight);
				this.ctx.closePath();
				this.ctx.fill();
			}
		},
		loadAnnotation : function(url)
		{
			var viewer = this;
			this.refUrl = url;
			$.getJSON(url, null, function(data)
			{
				 viewer.addTracks(data);
				 viewer.div.trigger({
						type: 'annotation_loaded'
				 });
			});
		},
		getTrackAt : function(x,y)
		{
			var t = y/23;
			t = t - (t%1);
			if(t < this.forwardTracks.length)
			{
				return this.forwardTracks[t];
			}
			else if(t > this.forwardTracks.length && t < (this.reverseTracks.length + this.forwardTracks.length + 1))
			{
				return this.reverseTracks[this.reverseTracks.length - (t - this.forwardTracks.length)];
			}
			return false;
		},
		getBaseAt : function(x,y)
		{
			var b = x - (this.showlabels ? this.labelWidth : 10);
			b = b / this.baseWidth;
			b = b - (b%1);
			b = Math.max(0,b) + this.offset;
			return b;
		},
		getFeatureAt : function(x,y)
		{
			var f = null; var fi = null;

			var t = this.getTrackAt(x, y);
			var b = this.getBaseAt(x, y);


			var features = this.tracks[this.trackIndex[t]].features;
			var count = features.length;
			for(var i = count; i--; )
			{
				if(b >= features[i].start && b <= features[i].end)
				{
					f = features[i];
					fi = i;
					break;
				}
			}
			return { feature : f, index : fi};
		},
		getFeatureByTrackAndBase : function(t,b, fs, ignore)
		{
			var f = null; var fi = null;
			if(!fs) fs = [];

			if(!ignore) ignore = 'none';

			var features = this.tracks[t].features;
			var count = features.length;
			for(var i = count; i--; )
			{
				if(b >= features[i].start && b <= features[i].end)
				{
					f = features[i];
					fi = i;
					fs.push(f);
					if(f.linkto && ignore != 'linkto')
					{
						fs = fs.concat(this.getFeatureByTrackAndBase(this.trackIndex[f.linkto.frame-1], f.linkto.base, [], 'linkfrom').features);
					}
					if(f.linkfrom && ignore != 'linkfrom')
					{
						fs = fs.concat(this.getFeatureByTrackAndBase(this.trackIndex[f.linkfrom.frame-1], f.linkfrom.base,[], 'linkto').features);
					}
				}
			}
			return { feature : f, index : fi, features : fs};
		},
		resetViewer : function()
		{
			this.ctx.clearRect(0,0, this.trackWidth + this.labelWidth, 400);
		},
		resize : function()
		{
			var w = this.div.innerWidth() - 26;
			var h = this.trackheight * 10;
			this.canvas.width = w;
			$(this.canvas).height(h);

			this.baseWidth = (w - this.labelWidth) / this.numBases;
			this.trackWidth = w - this.labelWidth;
			this.offset = 0;
			this.draw();
		},
		setOffset : function(val)
		{
			clearTimeout(this.nextDraw);
			var d = this;
			if(! this.overview)
			{
				this.offset = Math.round(val);
			}
			this.nextDraw = setTimeout(function(){d.draw();}, this.numBases > 10000000 ? 100 : 5);
		},
		setZoom : function(val)
		{
			clearTimeout(this.nextDraw);
			var old_l = this.numBases;

			this.numBases = [1e6, 5e5, 1e5, 5e4, 1e4, 5e3, 1e3, 5e2, 1e2][val];
			this.horizontalScroller.setMax(this.c_length - this.numBases);
			this.horizontalScroller.setStep(Math.round(this.numBases/4));

            this.verticalScroller.setValue(val);

            var move = (old_l - this.numBases) / 2

            this.offset = Math.min(Math.max(0, this.offset + move) , this.c_length - this.numBases);

			//this.nextDraw = setTimeout(function(){d.draw();}, this.numBases > 10000000 ? 100 : 5);
			this.draw();
		},
		setZoomBases : function(val)
		{
			clearTimeout(this.nextDraw);
			var d = this;
			this.numBases = val;
			this.horizontalScroller.setMax(this.c_length - this.numBases);

			this.nextDraw = setTimeout(function(){d.draw();}, this.numBases > 10000000 ? 100 : 5);
		}
};

/**
 *
 * @param {string} trackName the name of this track
 */
BRAGV.Track = function(trackName)
{
	this.name = trackName;
	this.features = [];
	this.isReverse = false;

	if(debug) {
		function genPos(min, max)
		{
			return max * Math.random() + min;
		}

		var s = genPos(1, 1000);
		var e = genPos(s+1, 1000);

		this.features = [{
			s: s,
			e: e,
			n: 'ABC',
			i: 'DEF'
		}];
	}
};

BRAGV.Scroller = function(divName, dir, conf)
{
	this.div = $('#' + divName);

	this.direction = dir;
	this.min = 0;
	this.max = 100;
	this.step = 10;

	if(conf){
		if(conf['min']) this.min = conf.min;
		if(conf['max']) this.max = conf.max;
		if(conf['step']) this.step = conf.step;
	}

	if(dir == 'v')
	{
		this.div.prepend('<div class="bragv_scroller bragv_vertical"><div class="bragv_scroller_handle"></div><div class="bragv_scroller_ctl_lesser"></div><div class="bragv_scroller_ctl_greater"></div></div>');
		//$('.bragv_vertical').height($('.bragv_canvas').height() - 27);
	}
	else
	{
		this.div.append('<div class="bragv_scroller bragv_horizontal"><div class="bragv_scroller_handle"></div><div class="bragv_scroller_ctl_lesser"></div><div class="bragv_scroller_ctl_greater"></div></div>');
	}
	this.base = $('.bragv_scroller', this.div);
	this.base = this.base[0];

	var bar = this;

	$('.bragv_scroller_ctl_lesser', this.base).click(function(evt){
		var newval = bar.getValue() - bar.step;
		bar.setValue(newval, true);
	});
	$('.bragv_scroller_ctl_greater', this.base).click(function(evt){
		var newval = bar.getValue() + bar.step;
		bar.setValue(newval, true);
	});


	$('.bragv_scroller_handle', this.base).slider({
		min : bar.min,
		max : bar.max,
		step: bar.step,
		orientation : (dir == 'v' ? 'vertical' : 'horizontal'),
		slide : function(event, ui)
		{
			try{
				if(bar.onValueChange) bar.onValueChange(ui.value);
			}catch(e){if(console)console.error(e);}
		},
		stop : function(event, ui){
			if(bar.onDrop) bar.onDrop(ui.value);
		}

	});
	this.setValue(0);


};

BRAGV.Scroller.prototype = {
	getValue: function()
	{
		return $('.bragv_scroller_handle', this.base).slider("value");
	},
	setValue : function(val, fireEvent)
	{
		$('.bragv_scroller_handle', this.base).slider("value", val);
		if(this.onValueChange && fireEvent) this.onValueChange(this.getValue());
		if(this.onDrop) this.onDrop(val);
	},
	setMin : function(val)
	{
		this.min = val;
		$('.bragv_scroller_handle', this.base).slider("option", "min", val);
	},
	setMax : function(val)
	{
		this.max = val;
		$('.bragv_scroller_handle', this.base).slider("option", "max", val);
	},
	setStep : function(val)
	{
		this.step = val;
		$('.bragv_scroller_handle', this.base).slider("option", "step", val);
	}
};
