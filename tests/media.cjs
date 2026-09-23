const assert=require('assert');
(async()=>{
  const {videoInfo}=await import('../js/media.js');
  const drive=videoInfo('https://drive.google.com/file/d/1AbC_def-123/view?usp=sharing');
  assert.equal(drive.provider,'drive');
  assert.equal(drive.src,'https://drive.google.com/file/d/1AbC_def-123/preview');
  assert.equal(drive.type,'embed');
  const driveOpen=videoInfo('https://drive.google.com/open?id=XYZ_987');
  assert.equal(driveOpen.src,'https://drive.google.com/file/d/XYZ_987/preview');
  const youtube=videoInfo('https://youtu.be/abc123');
  assert.equal(youtube.provider,'youtube');
  assert.equal(videoInfo('http://example.com/video.mp4'),null);
  console.log('PASS: Google Drive, YouTube and HTTPS video embedding');
})().catch(err=>{console.error(err);process.exitCode=1});
