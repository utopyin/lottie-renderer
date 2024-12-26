import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

interface RenderOptions {
	width: number;
	height: number;
	factor?: number;
	fps?: number;
	quality?:
		| "ultrafast"
		| "superfast"
		| "veryfast"
		| "faster"
		| "fast"
		| "medium"
		| "slow"
		| "slower"
		| "veryslow";
	backgroundColor?: "transparent" | "current";
}

interface LottiePlayerElement extends HTMLElement {
	load(src: string): void;
	play(): void;
	pause(): void;
	stop(): void;
	seeking: boolean;
	currentFrame: number;
	getLottie(): any;
	seek(frame: number): void;
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			"lottie-player": any;
		}
	}
}

async function renderLottieToVideo(
	htmlPath: string,
	outputPath: string,
	options: RenderOptions
): Promise<string> {
	const {
		width,
		height,
		factor = 1,
		fps = 60,
		quality = "veryslow",
		backgroundColor = "transparent",
	} = options;

	const browser = await puppeteer.launch({
		headless: true,
		args: [`--window-size=${width * factor},${height * factor}`],
	});

	const page = await browser.newPage();
	await page.setViewport({ width: width * factor, height: height * factor });

	// Create temp directory for frames
	const tempDir = path.join(__dirname, "temp_frames");
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir);
	}

	// Load the HTML file containing the Lottie animation
	await page.goto(`file://${path.resolve(htmlPath)}`);

	// Wait for Lottie to load and be ready
	await page.waitForFunction(() => {
		const animation = document.querySelector(
			"lottie-player"
		) as LottiePlayerElement;
		return (
			animation && animation.getLottie && animation.getLottie().isLoaded
		);
	});

	// Get animation details
	const { animationDuration, totalLottieFrames } = await page.evaluate(() => {
		const player = document.querySelector(
			"lottie-player"
		) as LottiePlayerElement;
		const lottie = player.getLottie();
		return {
			animationDuration: lottie.getDuration(),
			totalLottieFrames: lottie.totalFrames,
		};
	});

	// Calculate frames
	const totalVideoFrames = animationDuration * fps;
	const framesPerLoop = totalLottieFrames;

	// Capture frames
	for (let i = 0; i < totalVideoFrames; i++) {
		const framePath = path.join(
			tempDir,
			`frame-${i.toString().padStart(5, "0")}.png`
		);

		// Set the current frame
		await page.evaluate(
			(frameNum: number, totalFrames: number) => {
				const player = document.querySelector(
					"lottie-player"
				) as LottiePlayerElement;
				const lottie = player.getLottie();

				// Calculate frame number within the animation loop
				const currentFrame = Math.floor(frameNum % totalFrames);

				// Directly set the current frame
				lottie.goToAndStop(currentFrame, true);

				return new Promise<number>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(resolve);
					});
				});
			},
			i,
			framesPerLoop
		);

		// Wait for the frame to be ready
		await page.waitForFunction(
			() => {
				const player =
					document.querySelector<HTMLMediaElement>("lottie-player");
				return player && !player.seeking;
			},
			{ timeout: 1000 }
		);

		await page.screenshot({
			path: framePath,
			type: "png",
			omitBackground: backgroundColor === "transparent",
		});
		console.log("Screenshotted page N°" + i);
	}

	// Close browser
	await browser.close();

	// Use ffmpeg to combine frames into video
	const ffmpegCommand = `ffmpeg -framerate ${fps} -i ${path.join(
		tempDir,
		"frame-%05d.png"
	)} -c:v libx264 -preset ${quality} -crf 17 -pix_fmt yuv420p ${outputPath}`;

	console.log(ffmpegCommand);
	return new Promise((resolve, reject) => {
		exec(ffmpegCommand, (error, stdout, stderr) => {
			console.log(stdout);
			console.log(stderr);
			// Clean up temp frames
			fs.readdirSync(tempDir).forEach((file) => {
				fs.unlinkSync(path.join(tempDir, file));
			});

			fs.rmdirSync(tempDir);

			if (error) {
				reject(error);
				return;
			}
			resolve(outputPath);
		});
	});
}

export { renderLottieToVideo, type RenderOptions };
