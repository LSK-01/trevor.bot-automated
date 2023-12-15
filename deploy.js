const { exec } = require("child_process");
const os = require("os");
const env = require("./env");
const fs = require("fs");
const path = require("path");
const deployUploadPubSub =
	"gcloud functions deploy uploadPubSub --trigger-topic hourly-message --runtime nodejs14 --project trevorbot-393718 --memory 8192 --timeout 500s";
const deployRefreshPubSub =
	"gcloud functions deploy refreshPubSub --trigger-topic fifty-days-message --runtime nodejs14 --project trevorbot-393718 --memory 128 --timeout 200s";

// Check if the tmpDir variable is set correctly
if (env.tmpDir !== os.tmpdir()) {
	console.log("tmpDir is not set correctly for deployment. Aborting.");
	return;
}

const files = fs.readdirSync(__dirname);
files.forEach((file) => {
    if(path.extname(file) === '.js'){
        checkIIFE(file);
    }
});

function checkIIFE(file){
// Check for IIFE
    let content = fs.readFileSync(file, 'utf-8');
    if(content.includes('async () =>') && !content.includes('/* (async ()')){
        console.log('IIFE found in ' + file + '. Aborting.');
        process.exit(0);
    }
}

const args = process.argv.slice(2);

if (args.includes('refreshPubSub')) {
    console.log('Deploying refreshPubSub...');
  exec(deployRefreshPubSub, (error, stdout, stderr) => {
	if (error) {
		console.log(`An error occurred during deployment: ${error.message}`);
		return;
	}
	if (stderr) {
		console.log(`stderr: ${stderr}`);
		return;
	}
	console.log(`stdout: ${stdout}`);
});

} else {
    console.log('Deploying uploadPubSub...');
    exec(deployUploadPubSub, (error, stdout, stderr) => {
        if (error) {
            console.log(`An error occurred during deployment: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
    
}

