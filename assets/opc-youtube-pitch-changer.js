/*! YouTube Pitch Changer 1.0.0 | onlinepitchchanger.com | GPL-2.0-or-later */
!function(){"use strict";
var t=["C","D♭","D","E♭","E","F","F♯","G","A♭","A","B♭","B"],
    e=["C","C♯","D","E♭","E","F","F♯","G","G♯","A","B♭","B"],
    a=["original pitch","a half step","a whole step","a minor third","a major third","a perfect fourth","a tritone","a perfect fifth","a minor sixth","a major sixth","a minor seventh","a major seventh","one octave"],
    o={
      singer:"Too high or too low? Lower 1–3 semitones for a song that strains at the top, raise it for one that sits too low; try −5 or +5 to swap between a male and a female key.",
      guitar:"Match the video to your capo or tuning: a guitarist in E♭ tuning sounds 1 semitone low, so press ♯ once to play along in standard tuning.",
      piano:"Shift the video into a key with fewer black keys while you learn, then practise it again at 0 in the original key.",
      vocal:"Put the teacher's exercises in your range: men following a female coach usually go −5 to −12, women following a male coach +5 to +12.",
      band:"Agree on one shift for the whole band, write it on the set list, and check the new key below before you rehearse.",
      theory:"Hear transposition at work: play the same passage at 0, +5 and +7 and listen how the melody keeps its shape in each key."
    };

function i(t){return 10*Math.round((110+1e3*(2048/t.sampleRate+(t.baseLatency||0)+(t.outputLatency||.04)))/10)}
function n(t){return t>0?"+"+t:t<0?"−"+Math.abs(t):"0"}

function r(t){
  if(t=(t||"").trim(),/^[A-Za-z0-9_-]{11}$/.test(t))return{id:t,t:0};
  var e;
  try{e=new URL(/^https?:\/\//i.test(t)?t:"https://"+t)}catch(t){return null}
  var a=e.hostname.replace(/^(www|m|music)\./,""),o="";
  if("youtu.be"===a)o=e.pathname.split("/")[1]||"";
  else if(/(^|\.)youtube(-nocookie)?\.com$/.test(a)){
    o=e.searchParams.get("v")||"";
    var i=e.pathname.match(/^\/(?:embed|shorts|live|v|e)\/([A-Za-z0-9_-]{11})/);
    !o&&i&&(o=i[1]);
  }
  if(!/^[A-Za-z0-9_-]{11}$/.test(o))return null;
  var n,r=e.searchParams.get("t")||e.searchParams.get("start")||"",s=0;
  return/^\d+$/.test(r)?s=+r:(n=r.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/))&&(s=3600*(+n[1]||0)+60*(+n[2]||0)+(+n[3]||0)),{id:o,t:s};
}

function cleanTitle(t){
  if(!t)return"";
  return t
    .replace(/\s*[\(\[][^\)\]]*(?:video|audio|remaster|lyric|visual|hd|4k|mv|official|version|explicit|clean)[^\)\]]*[\)\]]/gi,"")
    .replace(/\s*\|\s*.*$/g,"")
    .replace(/\s*-\s*Topic$/i,"")
    .trim();
}

function parseLRC(lrcText){
  if(!lrcText||typeof lrcText!=="string")return[];
  var lines=lrcText.split("\n"),result=[],timeRegex=/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();if(!line)continue;
    timeRegex.lastIndex=0;var times=[],match,text=line;
    while((match=timeRegex.exec(line))!==null){
      var min=parseInt(match[1],10),sec=parseInt(match[2],10),ms=0;
      if(match[3])ms=match[3].length===1?parseInt(match[3],10)*100:match[3].length===2?parseInt(match[3],10)*10:parseInt(match[3],10);
      times.push(min*60+sec+ms/1000);
      text=text.replace(match[0],"");
    }
    text=text.trim();
    if(times.length>0&&text){
      for(var j=0;j<times.length;j++)result.push({time:times[j],text:text});
    }
  }
  result.sort(function(a,b){return a.time-b.time});
  return result;
}

var s={
  mobile:["Live pitch change needs a computer","Phones and tablets cannot share a tab's sound with a web page, so the pitch of a YouTube video cannot be changed live here. You can still watch the video and plan the new key; on a computer, open this page in Chrome or Edge."],
  firefox:["Firefox cannot share a tab's sound","Open this page in Chrome or Edge on your computer to change the pitch live. Here you can still watch the video and plan the new key."],
  safari:["Safari cannot share a tab's sound","Open this page in Chrome or Edge on your computer to change the pitch live. Here you can still watch the video and plan the new key."],
  old:["This browser cannot share a tab's sound","Update Chrome or Edge on your computer (version 109 or newer) to change the pitch live. Here you can still watch the video and plan the new key."]
};

function d(t){
  var e,a,i=this;
  this.el=t;
  this.cfg=JSON.parse(t.getAttribute("data-cfg")||"{}");
  this.st=0;
  this.cents=0;
  this.key=null;
  this.player=null;
  this.vid="";
  this.live=null;
  this.orig=!1;
  this.vr=!1;
  this.ready=!1;
  
  // Lyrics State
  this.lyrics=[];
  this.plainLyrics="";
  this.hasSynced=!1;
  this.lyricsOffset=0;
  this.activeLyricIndex=-1;
  this.lyricsTimer=null;
  this.currentTitle="";

  this.cap=(e=navigator.userAgent||"",a=navigator.mediaDevices,
    /Android|iPhone|iPad|iPod|Mobile/i.test(e)||/Macintosh/.test(e)&&navigator.maxTouchPoints>1?"mobile":
    /Firefox\//.test(e)?"firefox":
    /Safari\//.test(e)&&!/Chrome\/|Chromium\/|Edg\//.test(e)?"safari":
    a&&a.getDisplayMedia&&window.AudioWorkletNode&&(a.getSupportedConstraints?a.getSupportedConstraints():{}).suppressLocalAudioPlayback?"":"old");

  var n=function(e){return t.querySelector(e)};
  this.q=n;

  // Video Form
  n("[data-yt-form]").addEventListener("submit",function(t){t.preventDefault();i.load(n("[data-yt-url]").value)});

  // Pitch Controls
  [].forEach.call(t.querySelectorAll("[data-yt-step]"),function(t){t.addEventListener("click",function(){i.set(i.st+ +t.getAttribute("data-yt-step"))})});
  [].forEach.call(t.querySelectorAll("[data-yt-preset]"),function(t){t.addEventListener("click",function(){i.set(+t.getAttribute("data-yt-preset"))})});
  n("[data-yt-range]").addEventListener("input",function(t){i.set(+t.target.value)});
  n("[data-yt-cents]").addEventListener("input",function(t){i.cents=+t.target.value;i.render()});
  n("[data-yt-key]").addEventListener("change",function(t){var e=t.target.value;i.key=e?e.split("_").map(Number):null;i.render()});
  n("[data-yt-speed]").addEventListener("change",function(t){i.player&&i.player.setPlaybackRate&&i.player.setPlaybackRate(+t.target.value)});
  n("[data-yt-use]").addEventListener("change",function(t){var e=o[t.target.value],a=n("[data-yt-tip]");a.hidden=!e;a.textContent=e||""});
  n("[data-yt-go]").addEventListener("click",function(){i.start()});
  n("[data-yt-stop]").addEventListener("click",function(){i.stop("Stopped. The video plays at its original pitch again.")});
  n("[data-yt-ab]").addEventListener("click",function(){i.setOrig(!i.orig)});

  // Vocal Reduce / Remove Voice (Instrumental Karaoke)
  var vrBtn=n("[data-yt-vr]");
  vrBtn&&vrBtn.addEventListener("click",function(){i.setVr(!i.vr)});

  // Lyrics Controls
  this.bindLyrics();

  window.addEventListener("pagehide",function(){i.stop()});

  if(this.cap){
    var r=s[this.cap];
    n("[data-yt-alttitle]").textContent=r[0];
    n("[data-yt-alttext]").textContent=r[1];
    n("[data-yt-alt]").hidden=!1;
    n("[data-yt-go]").disabled=!0;
    n("[data-yt-go]").textContent="Live pitch change: Chrome or Edge on a computer";
    this.status("Plan mode: choose the shift and the key here; the video plays at its original pitch.","");
  }
  this.render();
}

d.prototype.parse=r;

d.prototype.status=function(t,e){
  var a=this.q("[data-yt-status]");
  a.textContent=t;
  a.setAttribute("data-kind",e||"");
};

d.prototype.ratio=function(){
  return this.orig?1:Math.pow(2,(this.st+this.cents/100)/12);
};

d.prototype.set=function(t){
  this.st=Math.max(-12,Math.min(12,Math.round(t)));
  this.render();
};

d.prototype.setOrig=function(t){
  this.orig=!!t;
  this.render();
};

d.prototype.setVr=function(t){
  this.vr=!!t;
  this.render();
};

d.prototype.label=function(){
  var t=this.st,e=this.cents;
  return{
    big:n(t),
    unit:1===Math.abs(t)?"semitone":"semitones",
    ivl:0===t?e?"original key":"original pitch":a[Math.abs(t)]+(t>0?" up":" down"),
    c:e
  };
};

d.prototype.render=function(){
  var a=this.q,o=this.label(),r=this.st;
  a("[data-yt-st]").textContent=o.big;
  a("[data-yt-unit]").textContent=o.unit+(o.c?" "+n(o.c)+" cents":"");
  a("[data-yt-ivl]").textContent=o.ivl;
  a("[data-yt-range]").value=r;
  a("[data-yt-cout]").textContent=n(this.cents);
  [].forEach.call(this.el.querySelectorAll("[data-yt-preset]"),function(t){
    t.setAttribute("aria-pressed",+t.getAttribute("data-yt-preset")===r?"true":"false");
  });
  var s,d=this.key;
  if(d){
    var c=((d[0]+r)%12+12)%12,l=d[1]?e:t;
    s="New key: "+l[c]+(d[1]?" minor":" major")+(r?" (from "+l[d[0]]+(d[1]?" minor":" major")+")":" (unchanged)");
  }else s="New key: "+t[(r%12+12)%12]+" (if the song is in C)";
  a("[data-yt-newkey]").textContent=s;

  var h=a("[data-yt-ab]");
  h.setAttribute("aria-pressed",this.orig?"true":"false");
  h.textContent=this.orig?"Back to "+o.big+" st":"Hear original";

  // Vocal Reduce (Remove Voice) button & badge
  var vrEl=a("[data-yt-vr]");
  if(vrEl){
    vrEl.setAttribute("aria-pressed",this.vr?"true":"false");
    vrEl.innerHTML=this.vr?'<span>🎤 Remove Voice: <b>ON</b> (Instrumental Only)</span>':'<span>🎤 Remove Voice: <b>OFF</b> (Full Song)</span>';
  }
  var vrBadge=a("[data-yt-vrbadge]");
  if(vrBadge){
    vrBadge.hidden=!this.vr;
  }

  if(this.live){
    this.live.ctx&&(this.live.ms=i(this.live.ctx));
    this.live.node&&this.live.node.port.postMessage({ratio:this.ratio(),vocalReduce:this.vr});
    this.syncWin();
    if(this.live.on){
      var vrTag=this.vr?" · 🎤 Instrumental (Voice Removed)":"";
      this.status(this.orig?'Live: original pitch (A/B)'+vrTag+'. Press "Back to '+o.big+' st" to hear the change again.':"Live: "+o.big+" "+o.unit+(o.c?" "+n(o.c)+" cents":"")+vrTag+'. Sound plays through the "Pitch sound" window'+(this.live.ms?", about "+this.live.ms+" ms behind the picture.":"."),"live");
    }
  }
};

/* ==================== KARAOKE LYRICS MANAGEMENT ==================== */

d.prototype.bindLyrics=function(){
  var self=this,q=this.q;

  // Nudge sync offset
  [].forEach.call(this.el.querySelectorAll("[data-yt-lrc-nudge]"),function(btn){
    btn.addEventListener("click",function(){
      var val=btn.getAttribute("data-yt-lrc-nudge");
      if(val==="0")self.lyricsOffset=0;
      else self.lyricsOffset=Math.round((self.lyricsOffset+parseFloat(val))*10)/10;
      var out=q("[data-yt-lrc-offset]");
      if(out)out.textContent=(self.lyricsOffset>0?"+":"")+self.lyricsOffset.toFixed(1)+"s";
      if(self.player&&typeof self.player.getCurrentTime==="function"){
        self.updateLyricsHighlight(self.player.getCurrentTime());
      }
    });
  });

  // Font size
  [].forEach.call(this.el.querySelectorAll("[data-yt-lrc-size]"),function(btn){
    btn.addEventListener("click",function(){
      var size=btn.getAttribute("data-yt-lrc-size");
      var vp=q("[data-yt-lrc-viewport]");
      if(vp)vp.setAttribute("data-size",size);
      [].forEach.call(self.el.querySelectorAll("[data-yt-lrc-size]"),function(b){b.classList.remove("active")});
      btn.classList.add("active");
    });
  });

  // Search toggle
  var sToggle=q("[data-yt-lrc-search-toggle]");
  var sBar=q("[data-yt-lrc-search-bar]");
  if(sToggle&&sBar){
    sToggle.addEventListener("click",function(){
      sBar.hidden=!sBar.hidden;
      if(!sBar.hidden){
        var inp=q("[data-yt-lrc-query]");
        if(inp){inp.value=self.currentTitle||"";inp.focus()}
      }
    });
  }
  var sCancel=q("[data-yt-lrc-search-cancel]");
  if(sCancel&&sBar){sCancel.addEventListener("click",function(){sBar.hidden=!0})}

  // Search button
  var sDo=q("[data-yt-lrc-search-do]");
  if(sDo){
    sDo.addEventListener("click",function(){
      var inp=q("[data-yt-lrc-query]");
      if(inp&&inp.value.trim()){
        self.fetchLyrics(inp.value.trim());
      }
    });
    var inp=q("[data-yt-lrc-query]");
    inp&&inp.addEventListener("keydown",function(e){
      if(e.key==="Enter"){
        e.preventDefault();
        if(inp.value.trim())self.fetchLyrics(inp.value.trim());
      }
    });
  }

  // Custom lyrics toggle
  var cToggle=q("[data-yt-lrc-custom-toggle]");
  var cBar=q("[data-yt-lrc-custom-bar]");
  if(cToggle&&cBar){
    cToggle.addEventListener("click",function(){
      cBar.hidden=!cBar.hidden;
      if(!cBar.hidden){
        var ta=q("[data-yt-lrc-custom-text]");
        if(ta)ta.focus();
      }
    });
  }
  var cCancel=q("[data-yt-lrc-custom-cancel]");
  if(cCancel&&cBar){cCancel.addEventListener("click",function(){cBar.hidden=!0})}

  // Custom lyrics apply
  var cApply=q("[data-yt-lrc-custom-apply]");
  if(cApply&&cBar){
    cApply.addEventListener("click",function(){
      var ta=q("[data-yt-lrc-custom-text]");
      if(ta&&ta.value.trim()){
        var parsed=parseLRC(ta.value.trim());
        if(parsed.length>0){
          self.setSyncedLyrics(ta.value.trim(),"Custom LRC Lyrics");
        }else{
          self.setPlainLyrics(ta.value.trim(),"Custom Plain Lyrics");
        }
        cBar.hidden=!0;
      }
    });
  }
};

d.prototype.fetchLyrics=function(query){
  var self=this,q=this.q;
  if(!query)return;
  var badge=q("[data-yt-lyrics-badge]");
  if(badge){
    badge.setAttribute("data-state","loading");
    badge.textContent="Searching lyrics…";
  }

  var apiUrl="/api/lyrics?q="+encodeURIComponent(query);
  var fallbackUrl="https://lrclib.net/api/search?q="+encodeURIComponent(query);

  fetch(apiUrl)
    .catch(function(){return fetch(fallbackUrl)})
    .then(function(res){
      if(!res.ok)throw new Error("HTTP "+res.status);
      return res.json();
    })
    .then(function(items){
      if(!Array.isArray(items)||items.length===0){
        // Try fallback to artist/title split
        var parts=query.split(/[-–—]/);
        if(parts.length>1){
          var subQuery=parts[1].trim()+" "+parts[0].trim();
          return fetch("/api/lyrics?q="+encodeURIComponent(subQuery))
            .catch(function(){return fetch("https://lrclib.net/api/search?q="+encodeURIComponent(subQuery))})
            .then(function(r){return r.json()})
            .then(function(subItems){
              if(Array.isArray(subItems)&&subItems.length>0)return self.processLyricsResults(subItems,query);
              self.showNoLyrics(query);
            });
        }
        self.showNoLyrics(query);
        return;
      }
      self.processLyricsResults(items,query);
    })
    .catch(function(){
      self.showNoLyrics(query);
    });
};

d.prototype.processLyricsResults=function(items,query){
  var self=this,q=this.q;
  var best=null;
  for(var i=0;i<items.length;i++){
    if(items[i].syncedLyrics){
      best=items[i];
      break;
    }
  }
  if(!best&&items.length>0)best=items[0];

  if(best){
    var titleDisplay=(best.artistName?best.artistName+" – ":"")+best.trackName;
    var tEl=q("[data-yt-lyrics-title]");
    if(tEl)tEl.textContent=titleDisplay;

    if(best.syncedLyrics){
      self.setSyncedLyrics(best.syncedLyrics,titleDisplay);
    }else if(best.plainLyrics){
      self.setPlainLyrics(best.plainLyrics,titleDisplay);
    }else{
      self.showNoLyrics(query);
    }

    // Populate search results dropdown if multiple
    var rBox=q("[data-yt-lyrics-results]");
    if(rBox&&items.length>1){
      rBox.innerHTML="";
      items.slice(0,6).forEach(function(item){
        var div=document.createElement("div");
        div.className="opc-yt-lrc-result-item";
        div.innerHTML='<span><strong>'+(item.trackName||"")+'</strong> — '+(item.artistName||"")+'</span><span>'+(item.syncedLyrics?'<b style="color:#38bdf8">Synced</b>':'Plain')+'</span>';
        div.onclick=function(){
          var name=(item.artistName?item.artistName+" – ":"")+item.trackName;
          if(item.syncedLyrics)self.setSyncedLyrics(item.syncedLyrics,name);
          else if(item.plainLyrics)self.setPlainLyrics(item.plainLyrics,name);
          rBox.hidden=!0;
        };
        rBox.appendChild(div);
      });
      rBox.hidden=!1;
    }
  }else{
    self.showNoLyrics(query);
  }
};

d.prototype.showNoLyrics=function(query){
  var q=this.q;
  var badge=q("[data-yt-lyrics-badge]");
  if(badge){
    badge.setAttribute("data-state","idle");
    badge.textContent="No lyrics found";
  }
  var content=q("[data-yt-lrc-content]");
  if(content){
    content.innerHTML='<div class="opc-yt-lrc-empty"><p class="opc-yt-lrc-empty-msg">No automatic lyrics found for “'+(query||"this song")+'”.</p><p class="opc-yt-lrc-empty-sub">Click <b>🔍 Search</b> above to search with alternate spelling or artist name, or click <b>✏️ Custom</b> to paste your lyrics!</p></div>';
  }
};

d.prototype.setSyncedLyrics=function(lrcText,name){
  this.lyrics=parseLRC(lrcText);
  this.hasSynced=!0;
  this.activeLyricIndex=-1;
  var q=this.q;
  var badge=q("[data-yt-lyrics-badge]");
  if(badge){
    badge.setAttribute("data-state","synced");
    badge.textContent="🎤 Synced Karaoke Lyrics ("+this.lyrics.length+" lines)";
  }
  if(name){
    var tEl=q("[data-yt-lyrics-title]");
    if(tEl)tEl.textContent=name;
  }
  this.renderLyrics();
  if(this.player&&typeof this.player.getCurrentTime==="function"){
    this.updateLyricsHighlight(this.player.getCurrentTime());
  }
};

d.prototype.setPlainLyrics=function(text,name){
  this.lyrics=[];
  this.plainLyrics=text;
  this.hasSynced=!1;
  this.activeLyricIndex=-1;
  var q=this.q;
  var badge=q("[data-yt-lyrics-badge]");
  if(badge){
    badge.setAttribute("data-state","plain");
    badge.textContent="📄 Plain Lyrics";
  }
  if(name){
    var tEl=q("[data-yt-lyrics-title]");
    if(tEl)tEl.textContent=name;
  }
  this.renderPlainLyrics();
};

d.prototype.renderLyrics=function(){
  var self=this,q=this.q;
  var content=q("[data-yt-lrc-content]");
  if(!content)return;
  content.innerHTML="";

  this.lyrics.forEach(function(item,idx){
    var line=document.createElement("div");
    line.className="opc-yt-lrc-line";
    line.setAttribute("data-idx",idx);
    line.setAttribute("data-time",item.time);
    line.textContent=item.text;
    line.addEventListener("click",function(){
      if(self.player&&typeof self.player.seekTo==="function"){
        var target=Math.max(0,item.time-self.lyricsOffset);
        self.player.seekTo(target,!0);
      }
    });
    content.appendChild(line);
  });
};

d.prototype.renderPlainLyrics=function(){
  var q=this.q;
  var content=q("[data-yt-lrc-content]");
  if(!content)return;
  content.innerHTML="";
  var lines=this.plainLyrics.split("\n");
  lines.forEach(function(str){
    var p=document.createElement("div");
    p.className="opc-yt-lrc-line";
    p.textContent=str.trim()||"\u00A0";
    content.appendChild(p);
  });
};

d.prototype.updateLyricsHighlight=function(currentTime){
  if(!this.hasSynced||!this.lyrics||this.lyrics.length===0)return;
  var adjTime=currentTime+this.lyricsOffset;
  var targetIdx=-1;
  for(var i=0;i<this.lyrics.length;i++){
    if(this.lyrics[i].time<=adjTime){
      targetIdx=i;
    }else{
      break;
    }
  }

  if(targetIdx!==this.activeLyricIndex){
    this.activeLyricIndex=targetIdx;
    var content=this.q("[data-yt-lrc-content]");
    var vp=this.q("[data-yt-lrc-viewport]");
    if(content&&vp){
      var activeEl=content.querySelector(".opc-yt-lrc-line.is-active");
      if(activeEl)activeEl.classList.remove("is-active");
      if(targetIdx>=0){
        var newActive=content.querySelector('.opc-yt-lrc-line[data-idx="'+targetIdx+'"]');
        if(newActive){
          newActive.classList.add("is-active");
          var offset=newActive.offsetTop-(vp.clientHeight/2)+(newActive.clientHeight/2);
          vp.scrollTo({top:Math.max(0,offset),behavior:"smooth"});
        }
      }
    }
  }
};

d.prototype.startLyricsTracking=function(){
  var self=this;
  if(this.lyricsTimer)clearInterval(this.lyricsTimer);
  this.lyricsTimer=setInterval(function(){
    if(self.player&&typeof self.player.getCurrentTime==="function"&&typeof self.player.getPlayerState==="function"){
      if(self.player.getPlayerState()===1){
        var t=self.player.getCurrentTime();
        self.updateLyricsHighlight(t);
      }
    }
  },100);
};

d.prototype.stopLyricsTracking=function(){
  if(this.lyricsTimer){
    clearInterval(this.lyricsTimer);
    this.lyricsTimer=null;
  }
};

/* ==================== YOUTUBE VIDEO LOADER & WORKLET ==================== */

var c=null;
function l(){
  [].forEach.call(document.querySelectorAll("[data-opc-yt]"),function(t){
    t.opcYt||(t.opcYt=new d(t));
  });
}

d.prototype.load=function(t){
  var e=this,a=this.q,o=r(t),i=a("[data-yt-urlmsg]"),n=a("[data-yt-url]");
  if(!o){
    n.setAttribute("aria-invalid","true");
    i.setAttribute("data-kind","error");
    i.textContent=t.trim()?"That is not a YouTube video link. Copy the address of the video (youtube.com/watch?v=…, youtu.be/…, a Shorts link) or its 11-character ID.":"Paste a YouTube link first.";
    return!1;
  }
  n.removeAttribute("aria-invalid");
  i.setAttribute("data-kind","");
  i.textContent="Loading the YouTube player…";
  this.vid=o.id;
  this.ready=!1;
  a("[data-yt-vid]").textContent=o.id;
  a("[data-yt-vtitle]").textContent="";
  a("[data-yt-vinfo]").hidden=!1;

  // Reset lyrics
  var badge=a("[data-yt-lyrics-badge]");
  if(badge){badge.setAttribute("data-state","loading");badge.textContent="Fetching video info…"}

  // Fetch title immediately via oEmbed proxy
  fetch("/api/yt-meta?id="+encodeURIComponent(o.id))
    .then(function(r){return r.json()})
    .then(function(meta){
      if(meta&&meta.title){
        e.currentTitle=meta.title;
        a("[data-yt-vtitle]").textContent=meta.title;
        var clean=cleanTitle(meta.title);
        e.fetchLyrics(clean);
      }
    })
    .catch(function(){});

  var s=a("[data-yt-player]");
  if(this.player&&this.player.loadVideoById){
    this.player.loadVideoById({videoId:o.id,startSeconds:o.t});
    return!0;
  }

  s.innerHTML="<div></div>";
  (window.YT&&window.YT.Player?Promise.resolve(window.YT):c||(c=new Promise(function(t,e){
    var a=window.onYouTubeIframeAPIReady,o=!1;
    window.onYouTubeIframeAPIReady=function(){
      o=!0;
      if("function"==typeof a)try{a()}catch(t){}
      t(window.YT);
    };
    var i=document.createElement("script");
    i.src="https://www.youtube.com/iframe_api";
    i.async=!0;
    i.onerror=function(){c=null;e(new Error("api"))};
    document.head.appendChild(i);
    setTimeout(function(){if(!o){c=null;e(new Error("timeout"))}},12e3);
  }))).then(function(t){
    e.player=new t.Player(s.firstChild,{
      host:"https://www.youtube-nocookie.com",
      videoId:o.id,
      width:"100%",
      height:"100%",
      playerVars:{
        playsinline:1,
        rel:0,
        start:o.t||void 0,
        origin:location.origin,
        cc_load_policy:1
      },
      events:{
        onReady:function(){e.onReady()},
        onStateChange:function(t){
          if(t.data===1){
            e.startLyricsTracking();
          }else{
            e.stopLyricsTracking();
          }
          if(1===t.data||5===t.data||-1===t.data)e.onReady();
        },
        onError:function(t){e.onError(t.data)}
      }
    });
  },function(){
    s.innerHTML='<iframe title="YouTube video player" src="https://www.youtube-nocookie.com/embed/'+o.id+'?playsinline=1&rel=0&cc_load_policy=1'+(o.t?'&start='+o.t:'')+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    i.textContent="Video loaded (basic player: the YouTube controls script was blocked, so the speed option is off).";
    e.ready=!0;
    e.q("[data-yt-go]").disabled=!!e.cap;
  });
  return!0;
};

d.prototype.onReady=function(){
  var t=this.player,e=this.q,a=t&&t.getVideoData?t.getVideoData():{};
  if(a&&a.title){
    e("[data-yt-vtitle]").textContent=a.title;
    if(!this.currentTitle){
      this.currentTitle=a.title;
      this.fetchLyrics(cleanTitle(a.title));
    }
  }
  if(!this.ready){
    this.ready=!0;
    e("[data-yt-urlmsg]").textContent=this.cap?"Video loaded. Press play; choose your shift and key below.":"Video loaded. Press play, toggle “Remove Voice” for instrumental, and sing with the lyrics below!";
    var o=e("[data-yt-speed]"),i=t.getAvailablePlaybackRates?t.getAvailablePlaybackRates():[];
    o.disabled=!1;
    [].forEach.call(o.options,function(t){t.disabled=i.length>0&&i.indexOf(+t.value)<0});
  }
};

d.prototype.onError=function(t){
  var e={
    2:"That link does not contain a valid video ID.",
    5:"This video cannot play in an embedded player.",
    100:"Video not found: it was removed or is private.",
    101:"The owner does not allow this video to play on other websites, so its pitch cannot be changed here.",
    150:"The owner does not allow this video to play on other websites, so its pitch cannot be changed here."
  }[t]||"YouTube could not play this video here (error "+t+").";
  var a=this.q("[data-yt-urlmsg]");
  a.textContent=e;
  a.setAttribute("data-kind","error");
  this.ready=!1;
};

d.prototype.start=function(){
  var t=this;
  if(this.cap)return this.status(s[this.cap][1],"error"),Promise.resolve(!1);
  if(this.live)return Promise.resolve(!0);
  var e=window.open("","opc_yt_sound","popup=yes,width=400,height=340,left="+Math.max(0,(screen.availWidth||1200)-440)+",top=90");
  return e?(
    this.live={win:e,on:!1},
    this.buildWin(e),
    this.status("Choose “Allow” in the browser's sharing box and keep “Also share tab audio” switched on.","busy"),
    this.q("[data-yt-go]").hidden=!0,
    this.q("[data-yt-liverow]").hidden=!1,
    navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:1,width:320,height:180,displaySurface:"browser"},
      audio:{suppressLocalAudioPlayback:!0,echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1},
      preferCurrentTab:!0,
      selfBrowserSurface:"include",
      surfaceSwitching:"exclude",
      systemAudio:"exclude",
      monitorTypeSurfaces:"exclude"
    }).then(function(e){
      var a=t.live;
      if(!a)return e.getTracks().forEach(function(t){t.stop()}),!1;
      a.stream=e;
      var o=e.getAudioTracks()[0],n=e.getVideoTracks()[0],r=n&&n.getSettings?n.getSettings().displaySurface:"browser";
      if(!o)return t.stop("No sound was shared. Press Start again and keep “Also share tab audio” switched on.","error"),!1;
      if(r&&"browser"!==r)return t.stop("Please share this tab, not a window or the whole screen. Press Start again.","error"),!1;
      n&&(n.enabled=!1);
      o.addEventListener("ended",function(){t.stop("Sharing ended. The video plays at its original pitch again.")});
      var s=a.win;
      if(!s||s.closed)return t.stop('The "Pitch sound" window was closed. Press Start again and keep it open.',"error"),!1;
      var d=new s.AudioContext({latencyHint:"interactive"});
      return a.ctx=d,d.onstatechange=function(){t.syncWin()},d.audioWorklet.addModule(t.cfg.worklet).then(function(){
        if(!t.live)return!1;
        var o=d.createMediaStreamSource(e),n=new s.AudioWorkletNode(d,"opc-yt-shifter",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{fft:2048}});
        n.port.postMessage({ratio:t.ratio(),vocalReduce:t.vr});
        o.connect(n);
        n.connect(d.destination);
        a.src=o;
        a.node=n;
        a.on=!0;
        a.ms=i(d);
        a.poll=setInterval(function(){a.win&&!a.win.closed||t.stop('The "Pitch sound" window was closed, so the pitch change stopped.')},500);
        "running"!==d.state&&d.resume().catch(function(){});
        setTimeout(function(){t.syncWin()},300);
        t.render();
        return!0;
      })
    }).catch(function(e){
      var a=e&&e.name;
      return t.stop("NotAllowedError"===a?"Sharing was cancelled. Press Start again and choose “Allow” (keep “Also share tab audio” on).":"NotSupportedError"===a||"TypeError"===a?s.old[1]:"The live pitch change could not start ("+(a||"error")+"). Reload the page and try again.","error"),!1;
    })
  ):(
    this.status('Your browser blocked the small "Pitch sound" window. Allow pop-ups for this site, then press Start again.',"error"),
    Promise.resolve(!1)
  );
};

d.prototype.stop=function(t,e){
  var a=this.live;
  if(a){
    this.live=null;
    a.poll&&clearInterval(a.poll);
    try{a.node&&(a.node.port.postMessage({stop:1}),a.node.disconnect())}catch(t){}
    try{a.src&&a.src.disconnect()}catch(t){}
    a.stream&&a.stream.getTracks().forEach(function(t){t.stop()});
    try{a.ctx&&a.ctx.close()}catch(t){}
    try{a.win&&!a.win.closed&&a.win.close()}catch(t){}
  }
  this.orig=!1;
  var o=this.q;
  o&&(o("[data-yt-go]").hidden=!1,o("[data-yt-liverow]").hidden=!0,t&&this.status(t,e||""),this.render());
};

d.prototype.buildWin=function(t){
  var e=this,a=t.document;
  a.open();
  a.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pitch & Karaoke Sound – keep open</title><style>body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#0f172a;color:#e2e8f0}main{padding:16px}h1{font-size:17px;margin:0 0 4px;color:#fff}p{margin:0 0 10px;font-size:14px}.row{display:flex;align-items:center;gap:8px;margin:8px 0 10px}button{font:inherit;font-weight:800;border:0;border-radius:12px;cursor:pointer;min-height:46px}.st{min-width:60px;font-size:32px;background:#1e293b;color:#fff}.st:hover{background:#334155}.big{flex:1;text-align:center}.big b{display:block;font-size:38px;line-height:1.1;color:#fff}.big span{font-size:14px;color:#bae6fd}.on{width:100%;background:#0067ff;color:#fff;font-size:17px;margin:0 0 10px}.on:hover{background:#0052cc}.sm{background:#1e293b;color:#fff;padding:0 10px;font-size:13px;flex:1;white-space:nowrap;display:flex;align-items:center;justify-content:center}.sm:hover{background:#334155}.sm[aria-pressed=true]{background:#22b8f0;color:#0f172a}.ok{color:#86efac}.warn{color:#fcd34d}</style></head><body><main><h1>YouTube Pitch & Karaoke: sound</h1><p id="s">Waiting for the tab sound…</p><button type="button" class="on" id="on" hidden>Turn on the sound</button><div class="row"><button type="button" class="st" id="dn" aria-label="Lower 1 semitone">♭</button><div class="big" aria-live="polite"><b id="v">0</b><span id="u">semitones</span></div><button type="button" class="st" id="up" aria-label="Raise 1 semitone">♯</button></div><div class="row"><button type="button" class="sm" id="vr" aria-pressed="false">🎤 Voice: Full</button><button type="button" class="sm" id="ab" aria-pressed="false">Hear orig</button><button type="button" class="sm" id="x">Stop</button></div><p style="font-size:13px;color:#94a3b8">Keep this window open while you watch. Closing it stops live audio.</p></main></body></html>');
  a.close();
  var o=function(t){return a.getElementById(t)};
  o("dn").onclick=function(){e.set(e.st-1)};
  o("up").onclick=function(){e.set(e.st+1)};
  o("vr").onclick=function(){e.setVr(!e.vr)};
  o("ab").onclick=function(){e.setOrig(!e.orig)};
  o("x").onclick=function(){e.stop("Stopped. The video plays at its original pitch again.")};
  o("on").onclick=function(){var t=e.live;t&&t.ctx&&t.ctx.resume().then(function(){e.syncWin()})};
  try{t.focus()}catch(t){}
};

d.prototype.syncWin=function(){
  var t=this.live,e=t&&t.win;
  if(e&&!e.closed){
    var a=e.document,o=function(t){return a.getElementById(t)},i=this.label();
    if(o("v")){
      o("v").textContent=this.orig?"0":i.big;
      o("u").textContent=this.orig?"original (A/B)":i.unit+(i.c?" "+n(i.c)+" cents":"");
      o("ab").setAttribute("aria-pressed",this.orig?"true":"false");
      if(o("vr")){
        o("vr").setAttribute("aria-pressed",this.vr?"true":"false");
        o("vr").textContent=this.vr?"🎤 Voice: Muted":"🎤 Voice: Full";
      }
      var r=t.ctx&&"running"===t.ctx.state;
      o("on").hidden=!t.ctx||r;
      var s=o("s");
      if(t.on&&r){
        s.className="ok";
        s.textContent="Live: playing"+(this.vr?" · Instrumental (Voice Muted)":"")+(t.ms?" (delay ~"+t.ms+" ms)":".");
      }else if(t.on){
        s.className="warn";
        s.textContent="Press “Turn on the sound” once.";
      }
    }
  }
};

"loading"===document.readyState?document.addEventListener("DOMContentLoaded",l):l();
}();
