const axios = require("axios");
const env = require("./env");
const path = require("path");
const download = require("./download");
const sendEmail = require("./email");
const {deleteFile, storage, get_token} = require("./gcloud");

exports.uploadPubSub = async (event, context) => {
	try{
		await upload();
	}
	catch(e){
		console.log("error: ", e.message)
		await sendEmail("Error uploading: " + e.message)
	}
};

let access_token = "";
let containerPrepend = env.graph_api_url_prepend + env.insta_id + "/media";
let publishContainerPrepend = env.graph_api_url_prepend + env.insta_id + "/media_publish";

//upload() works as follows
//1. Choose a random file from the media folder
//1a. If the media folder is empty, download more media using the unofficial API
//1b. Formulate the caption
//2. Upload it to cloudinary
//3. Upload it to instagram
//3a. We produce a container for the piece of content
//3b. wait for the container to be ready
//3c. then publish the container
//4. Delete the file from the media folder
//4. Destroy the file from cloudinary

async function upload() {
	access_token = await get_token();
	let mediaInfo = {};
	console.log('dfuk');
	//check if any media in GCS
	const bucket = storage.bucket(env.bucketName);
  
	const [files] = await bucket.getFiles({autoPaginate: false, maxResults: 1 });
	
	if (files.length === 0) {
	  console.log(`Bucket ${env.bucketName} is empty.`);
	  const dlResult = await download();
	  if(!dlResult){
		console.log('No media left');
		return;
	  }
	} else {
	  console.log(`Bucket ${env.bucketName} is not empty.`);
	}

	const file = files[0];
	let deleteFiles = [];
	mediaInfo.creds = file.name.split("+")[1];
	let folder;
	//if carousel special treatment
	if(file.name.includes("/")){
		mediaInfo.type = 8;
		//get the 'folder' name
		folder = file.name.split("/")[0];
		//get all other media in that folder
		const [folderFiles] = await bucket.getFiles({prefix: folder});
		const urls = folderFiles.map(file => 
			{deleteFiles.push(file.name);
			return `${env.GCSUrl}${env.bucketName}/${file.name}`});

		let value = [];
		urls.map(url => {
			const urlObj = new URL(url);
			switch(path.extname(urlObj.pathname)){
				case ".jpg":
					value.push({type: 1, value: url});
					break;
				case ".mp4":
					value.push({type: 2, value: url});
					break;
				default:
					throw new Error("Unknown media type in carousel")
			}
		})

		mediaInfo.value = value;
	}
	else{
		deleteFiles.push(file.name);
		const url = `${env.GCSUrl}${env.bucketName}/${file.name}`;
		switch(path.extname(file.name)){
			case ".jpg":
				mediaInfo.type = 1;
				break;
			case ".mp4":
				mediaInfo.type = 2;
				break;
			default:
				throw new Error("Unknown media type")
		}
		mediaInfo.value = url;
	}

	let caption =
		"stolen from @" +
		mediaInfo.creds +
		". trevor.bot has been recently rebuilt, please be patient with any bugs. thank you for your support!";

	let container;
	let containerID;

	switch (mediaInfo.type) {
		case 1:
			container = await axios.post(
				containerPrepend,
				{},
				{
					params: {
						image_url: mediaInfo.value,
						caption: caption,
						access_token: access_token,
					},
				}
			);

			containerID = container.data.id;

			await waitForContainer(containerID);
			await publishContainer(containerID);

			break;
		case 2:
			container = await axios.post(
				containerPrepend,
				{},
				{
					params: {
						video_url: mediaInfo.value,
						media_type: "REELS",
						caption: caption,
						access_token: access_token,
					},
				}
			);

			containerID = container.data.id;

			await waitForContainer(containerID);
			await publishContainer(containerID);

			break;
		case 8:
			const containerPromises = mediaInfo.value.map(async ({type, value}) => {

				switch (type) {
					case 1:
						return await axios.post(
							containerPrepend,
							{},
							{
								params: {
									image_url: value,
									is_carousel_item: true,
									access_token: access_token,
								},
							}
						);
					
					case 2:
						return await axios.post(
							containerPrepend,
							{},
							{
								params: {
									video_url: value,
									media_type: "VIDEO",
									is_carousel_item: true,
									access_token: access_token,
								},
							}
						);
					default:
						throw new Error("Unknown media type in carousel")
				}
			});

			const containerIDPromises = (await Promise.all(containerPromises)).map(async (container) => {
				let childContainerID = container.data.id;
				await waitForContainer(childContainerID);
				return childContainerID;
			});

			const containerIDs = await Promise.all(containerIDPromises);

			const carouselContainer = await axios.post(
				containerPrepend,
				{},
				{
					params: {
						media_type: "CAROUSEL",
						children: containerIDs,
						access_token: access_token,
						caption: caption,
					},
				}
			);
			containerID = carouselContainer.data.id;

			await waitForContainer(containerID);
			await publishContainer(containerID);

			break;

		default:
			throw new Error("Unknown media type: ", mediaInfo.type);
	}

	//delete files from GCS
	await Promise.all(deleteFiles.map(async (file) => deleteFile(file)));
}

async function publishContainer(containerID) {
	await axios.post(
		publishContainerPrepend,
		{},
		{
			params: {
				creation_id: containerID,
				access_token: access_token,
			},
		}
	);
}

async function waitForContainer(containerID) {
	let containerStatus = "IN_PROGRESS";

	let status = await statusCheck(containerID);
	containerStatus = status.data.status_code;

	while (containerStatus === "IN_PROGRESS") {
		await new Promise((resolve) => setTimeout(resolve, 5000)); // wait 5 seconds before checking status again

		status = await statusCheck(containerID);

		console.log(status); // Log the entire response
		console.log(containerID); // Log the container ID

		containerStatus = status.data.status_code;
	}
}

async function statusCheck(containerID) {
	return await axios.get(`https://graph.facebook.com/${containerID}`, {
		params: {
			fields: "status_code",
			access_token: access_token,
		},
	});
}