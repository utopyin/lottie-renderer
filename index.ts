import { renderLottieToVideo } from "./renderer";

const INPUT_PATH = "./lottie.html";
const OUTPUT_PATH = "./render.mp4";

try {
	const renderPath = await renderLottieToVideo(INPUT_PATH, OUTPUT_PATH, {
		width: 393,
		height: 852,
		factor: 4,
	});
	console.log("Successfully rendered at " + renderPath);
} catch (e) {
	console.log("Error during render");
	console.log(e);
}
