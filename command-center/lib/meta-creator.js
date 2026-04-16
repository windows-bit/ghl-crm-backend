const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const BASE_URL = 'https://graph.facebook.com/v22.0';
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = process.env.META_PAGE_ID;
const DEFAULT_ADSET_ID = process.env.META_DEFAULT_ADSET_ID;
const LEAD_GEN_FORM_ID = process.env.META_LEAD_GEN_FORM_ID;

// Step 1: Upload image to Meta — returns image_hash
async function uploadImage(imageBuffer, fileName) {
  const form = new FormData();
  form.append('source', imageBuffer, { filename: fileName });
  form.append('access_token', ACCESS_TOKEN);

  const res = await axios.post(
    `${BASE_URL}/${AD_ACCOUNT_ID}/adimages`,
    form,
    { headers: form.getHeaders() }
  );

  // Response is { images: { filename: { hash, url, ... } } }
  const images = res.data?.images;
  const firstKey = Object.keys(images)[0];
  return images[firstKey].hash;
}

// Step 2: Create ad creative — returns creative_id
async function createCreative(imageHash, headline, primaryText) {
  const websiteUrl = 'https://spotoffreflections.com';

  const callToAction = {
    type: 'GET_QUOTE',
    value: { lead_gen_form_id: LEAD_GEN_FORM_ID },
  };

  const res = await axios.post(
    `${BASE_URL}/${AD_ACCOUNT_ID}/adcreatives`,
    {
      access_token: ACCESS_TOKEN,
      name: `Creative ${Date.now()}`,
      object_story_spec: {
        page_id: PAGE_ID,
        link_data: {
          image_hash: imageHash,
          link: 'https://fb.me/0',
          message: primaryText,
          name: headline,
          call_to_action: callToAction,
        },
      },
    }
  );

  return res.data.id;
}

// Step 3: Create a PAUSED ad in the default ad set — returns ad_id
async function createPausedAd(adName, creativeId) {
  const res = await axios.post(
    `${BASE_URL}/${AD_ACCOUNT_ID}/ads`,
    {
      access_token: ACCESS_TOKEN,
      name: adName,
      adset_id: DEFAULT_ADSET_ID,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    }
  );

  return res.data.id;
}

module.exports = { uploadImage, createCreative, createPausedAd };
