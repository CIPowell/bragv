/**
 * Bacterial Reference Annotation Genome Viewer
 * @namespace BRAGV
 */
var BRAGV = {};

var debug = true;

/**
 * The viewer object that contains all the elements of BRAGV
 * @param {string} divName
 */
BRAGV.Viewer = function(divName)
{
	this.offset = 0;
	this.numBases = 100000;
	
	this.c_length = 1000000;
	
	this.lastDraw = 0;
	
	this.start = 0;
	this.end = 0;
	
	this.tracks = {};
	
	this.labelWidth = 40.0;
	
	var div = $(document.getElementById(divName));
	
	var w = div.innerWidth() - 25;
	var h = 200;
	
	div.append('<canvas id='+ divName + '_Viewer width="'+w+'" height="'+h+'" class="bragv_canvas"></canvas>');
	
	this.ctx = $('canvas', div)[0].getContext('2d');
	
	this.baseWidth = (w - this.labelWidth) / this.numBases;
	this.trackWidth = w - this.labelWidth;
	
	this.horizontalScroller = new BRAGV.Scroller(divName, 'h');
	this.horizontalScroller.step = 1;
	this.verticalScroller = new BRAGV.Scroller(divName, 'v');
	this.verticalScroller.step = 20;
	var vwr = this;
	
	this.horizontalScroller.onValueChange = function(val)
	{
		
		vwr.setOffset(val);
	};
	this.verticalScroller.onValueChange = function(val)
	{
		vwr.setZoom(val);
	};
	/*if(debug)
	{
		this.tracks["track1"] = new BRAGV.Track();
		this.tracks["track2"] = new BRAGV.Track();
		this.tracks["track3"] = new BRAGV.Track();
		this.tracks["track4"] = new BRAGV.Track();
		this.tracks["track5"] = new BRAGV.Track();
		this.tracks["track6"] = new BRAGV.Track();
	}*/
	this.verticalScroller.setValue(80);
};

BRAGV.Viewer.prototype = {
		draw : function()
		{
			var thisDraw = new Date().getTime();
			this.lastdraw = thisDraw;
			this.resetViewer(thisDraw);
			this.drawTicks(thisDraw);
			this.drawTracks(this.trackWidth, thisDraw);
		},
		drawTicks : function(thisDraw)
		{
			if(thisDraw < this.lastDraw) return; 
			var start = 40;
			var end = this.trackWidth + 39;
			
			this.ctx.fillStyle = 'rgba(0,0,0,1)';
			
			this.ctx.beginPath();
			this.ctx.moveTo(start, 10);
			this.ctx.lineTo(start, 20);
			this.ctx.stroke();
			
			this.ctx.beginPath();
			this.ctx.moveTo(end, 10);
			this.ctx.lineTo(end, 20);
			this.ctx.stroke();
			
			var txt = (this.offset).toString();
			var wt = this.ctx.measureText(txt).width;
			this.ctx.fillText(this.offset, start-wt, 10);
			var txt = (this.offset + this.numBases).toString();
			var wt = this.ctx.measureText(txt).width;
			this.ctx.fillText(txt, end-wt, 10);
		},
		drawTracks : function(w, thisDraw)
		{
			var i = 1;
			var trackheight = 20;
			var padding = 3;
			var labelWidth = this.labelWidth;
			
			for(var t in this.tracks)
			{
				if(thisDraw < this.lastDraw) return; 
				var tracky  = i*(trackheight + padding);
				
				this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
				this.ctx.fillText(t, 5, ++i * (trackheight + padding) -10);
				
				this.ctx.fillStyle = 'rgba(80, 80, 80, 0.1)';
				this.ctx.fillRect(labelWidth, tracky, w, trackheight);
				
				this.lastpos = 0;
				var features = this.tracks[t].features;
				var count = features.length;
				
				this.baseWidth = this.trackWidth / this.numBases;
				
				for(var j = 0; j != count; j++)
				{
					if(thisDraw < this.lastDraw) return; 
					if(features[j].s > this.offset + this.numBases) break;
					if(features[j].e < this.offset) continue;
					
					/*if(debug){
						console.debug('drawing ' + features[j].i);
						console.debug(this.baseWidth);
						console.debug((40 + (features[j].s * this.baseWidth)));
						console.debug(tracky);
						console.debug((features[j].e - features[j].s) * this.baseWidth);
					}*/
					
					var start = labelWidth + (Math.max((features[j].s - this.offset) * this.baseWidth, 0));
					var width = (features[j].e - Math.max(this.offset, features[j].s)) * this.baseWidth;
					
					if((start+width) < (this.lastpos + 1)) continue;
					this.lastpos = start + width;
					this.ctx.fillStyle = 'rgba(255, 0, 0, 1)';
					this.ctx.fillRect(start, tracky, width, trackheight);
					//this.ctx.strokeRect(start, tracky, width, trackheight);
				}
			}
		},
		loadAnnotation : function(url)
		{
			viewer = this;
			$.getJSON(url, null, function(data)
			{	
				 viewer.addTracks(data);
			});
		},
		addTracks : function(obj)
		{
			var count = obj.length;
			for(var i = 0; i < count; i++)
			{
				this.c_length = Math.max(obj[i].length);
				var id = obj[i].frame + '_' + obj[i].strand;
				
				if(!viewer.tracks[id])viewer.tracks[id] = new BRAGV.Track(id);
				viewer.tracks[id].features = obj[i].features;
			}
			this.draw();
		},
		resetViewer : function()
		{
			this.ctx.clearRect(0,0, this.trackWidth + this.labelWidth, 400);
		},
		setOffset : function(val)
		{
			clearTimeout(this.nextDraw);
			var d = this;
			
			val = Math.round((val / this.horizontalScroller.max) * (this.c_length - this.numBases));
			
			this.offset = Math.round(val);
			this.nextDraw = setTimeout(function(){d.draw();}, this.numBases > 50000 ? 100 : 10);
		},
		setZoom : function(val)
		{
			clearTimeout(this.nextDraw);
			var d = this;
			this.numBases = Math.pow(10,Math.round(val / 20) + 1);
			this.nextDraw = setTimeout(function(){d.draw();}, this.numBases > 50000 ? 100 : 10);
		}
};

/**
 * 
 * @param {string} trackName the name of this track
 */
BRAGV.Track = function(trackName)
{
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

BRAGV.Scroller = function(divName, dir)
{
	this.div = $('#' + divName);

	this.direction = dir;
	this.min = 0;
	this.max = 100;
	this.step = 10;
	
	if(dir == 'v')
	{
		this.div.prepend('<div class="bragv_scroller bragv_vertical"><div class="bragv_scroller_handle"></div><div class="bragv_scroller_ctl_lesser"></div><div class="bragv_scroller_ctl_greater"></div></div>');
		$('.bragv_vertical').height($('.bragv_canvas').height() - 27);
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
		newval = newval - (newval % bar.step);
		newval = Math.max(newval, bar.min);
		bar.setValue(newval);
	});
	$('.bragv_scroller_ctl_greater', this.base).click(function(evt){
		var newval = bar.getValue() + bar.step;
		newval = newval + (newval % bar.step);
		newval = Math.min(newval, bar.max);
		bar.setValue(newval);
	});
	$('.bragv_scroller_handle', this.base).draggable({
		containment : 'parent',
		drag : function(event, ui)
		{
			bar.setValue(bar.getValue());
			//console.debug(bar.getValue());
		}
	});
	this.setValue(0);
};

BRAGV.Scroller.prototype = {
	getValue: function()
	{
		var rawval;
		var d_range;
		var v_range = this.max - this.min;
		
		if(this.direction == 'v')
		{ 
			d_range = $(this.base).innerHeight() - 24; // inner width of slider div minus width of slider
			rawval = $('.bragv_scroller_handle', this.base).css('top').replace('px','');
			rawval = d_range - rawval;
		}
		else
		{ 
			d_range = $(this.base).innerWidth() - 24;
			rawval = $('.bragv_scroller_handle', this.base).css('left').replace('px',''); 
		}
		 
		var val = (rawval/d_range) * v_range;
		val += this.min;
		return val;
	},
	setValue : function(val)
	{
		var rawval;
		var d_range;
		var v_range = this.max - this.min;
		var o_val = val;
		if(this.direction == 'v')
		{ 
			val = this.max - val;
			d_range = $(this.base).innerHeight() - 24; // inner width of slider div minus width of slider
		}
		else
		{ 
			d_range = $(this.base).innerWidth() - 24;
		}
		
		rawval = (val / v_range) * d_range;
		if(this.direction == 'v')
		{ 
			$('.bragv_scroller_handle', this.base).css('top', rawval + 'px'); 
		}
		else
		{ 
			$('.bragv_scroller_handle', this.base).css('left', rawval + 'px'); 
		}
		
		if(this.onValueChange) this.onValueChange(o_val);
	}
};
