#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'];

function findMediaFiles() {
    const currentDir = process.cwd();
    const files = fs.readdirSync(currentDir);
    
    const videoFiles = files
        .filter(file => file.match(/^input\d+\.mp4$/))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });
    
    const audioFiles = files
        .filter(file => {
            const match = file.match(/^audio(\d+)(\..+)$/);
            if (!match) return false;
            const ext = match[2].toLowerCase();
            return audioExtensions.includes(ext);
        })
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });
    
    return { videoFiles, audioFiles };
}

function getMediaMetadata(filePath) {
    try {
        const ffprobeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
        const output = execSync(ffprobeCmd, { encoding: 'utf8' });
        const metadata = JSON.parse(output);
        
        const fileStats = fs.statSync(filePath);
        
        return {
            file_path: filePath,
            file_name: path.basename(filePath),
            file_size: fileStats.size,
            modified_time: fileStats.mtime.toISOString(),
            format: metadata.format,
            streams: metadata.streams.map(stream => ({
                index: stream.index,
                codec_name: stream.codec_name,
                codec_type: stream.codec_type,
                duration: parseFloat(stream.duration) || null,
                bit_rate: parseInt(stream.bit_rate) || null,
                width: stream.width || null,
                height: stream.height || null,
                sample_rate: stream.sample_rate || null,
                channels: stream.channels || null,
                channel_layout: stream.channel_layout || null,
                frame_rate: stream.r_frame_rate || null,
                pixel_format: stream.pix_fmt || null,
                tags: stream.tags || {}
            }))
        };
    } catch (error) {
        console.error(`Error probing ${filePath}: ${error.message}`);
        return null;
    }
}

function createTimelineMetadata(videoFiles, audioFiles, options = {}) {
    const timeline = {
        version: "0.0.1",
        created: new Date().toISOString(),
        name: "Compiled Media Timeline",
        tracks: {}
    };
    
    // Only add transitions if enabled
    if (options.enableFades) {
        timeline.transitions = {
            fade_in: {
                duration: 1,
                type: "fade",
                apply_to: "first"
            },
            fade_out: {
                duration: 1,
                type: "fade",
                apply_to: "last"
            }
        };
    }
    
    if (videoFiles.length > 0) {
        timeline.tracks.video = [];
        videoFiles.forEach((file, index) => {
            const metadata = getMediaMetadata(file);
            if (metadata) {
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                const duration = videoStream ? videoStream.duration : parseFloat(metadata.format.duration) || 0;
                
                timeline.tracks.video.push({
                    name: path.basename(file),
                    source_url: file,
                    duration: Math.round(duration * 100) / 100,
                    width: videoStream ? videoStream.width : null,
                    height: videoStream ? videoStream.height : null,
                    codec_name: videoStream ? videoStream.codec_name : null,
                    frame_rate: videoStream && videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : null
                });
            }
        });
    }
    
    if (audioFiles.length > 0) {
        timeline.tracks.audio = [];
        audioFiles.forEach((file, index) => {
            const metadata = getMediaMetadata(file);
            if (metadata) {
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                const duration = audioStream ? audioStream.duration : parseFloat(metadata.format.duration) || 0;
                
                timeline.tracks.audio.push({
                    name: path.basename(file),
                    source_url: file,
                    duration: Math.round(duration * 100) / 100,
                    codec_name: audioStream ? audioStream.codec_name : null,
                    sample_rate: audioStream ? audioStream.sample_rate : null,
                    channels: audioStream ? audioStream.channels : null
                });
            }
        });
    }
    
    return timeline;
}

function main() {
    // Parse command-line arguments
    const args = process.argv.slice(2);
    const options = {
        enableFades: false // Default to no fades
    };
    
    // Check for --fades or -f flag
    if (args.includes('--fades') || args.includes('-f')) {
        options.enableFades = true;
    }
    
    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Usage: compile-metadata.js [options]');
        console.log('Options:');
        console.log('  --fades, -f   Enable fade in/out transitions');
        console.log('  --help, -h    Show this help message');
        process.exit(0);
    }
    
    console.log('Scanning for media files...');
    const { videoFiles, audioFiles } = findMediaFiles();
    
    console.log(`Found ${videoFiles.length} video file(s): ${videoFiles.join(', ')}`);
    console.log(`Found ${audioFiles.length} audio file(s): ${audioFiles.join(', ')}`);
    
    if (videoFiles.length === 0 && audioFiles.length === 0) {
        console.error('No input*.mp4 or audio*.* files found');
        process.exit(1);
    }
    
    console.log('Extracting metadata...');
    if (options.enableFades) {
        console.log('Fade transitions: ENABLED');
    } else {
        console.log('Fade transitions: DISABLED');
    }
    const timeline = createTimelineMetadata(videoFiles, audioFiles, options);
    
    const outputFile = 'timeline-metadata.json';
    fs.writeFileSync(outputFile, JSON.stringify(timeline, null, 2));
    console.log(`Timeline metadata saved to ${outputFile}`);
    
    console.log('\nSummary:');
    if (timeline.tracks.video && timeline.tracks.video.length > 0) {
        console.log(`Video: ${timeline.tracks.video.length} file(s)`);
        timeline.tracks.video.forEach(clip => {
            console.log(`  - ${clip.name}: ${clip.duration}s (${clip.width}x${clip.height}, ${clip.codec_name})`);
        });
    }
    if (timeline.tracks.audio && timeline.tracks.audio.length > 0) {
        console.log(`Audio: ${timeline.tracks.audio.length} file(s)`);
        timeline.tracks.audio.forEach(clip => {
            console.log(`  - ${clip.name}: ${clip.duration}s (${clip.codec_name}, ${clip.channels}ch)`);
        });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}