import OpenAI from "openai";
import axios from "axios";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getToken() {
  return axios.post(
    "https://lynkwell-dev.us.auth0.com/oauth/token",
    {
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: "https://api.dev.lynkwell.com",
      grant_type: "client_credentials",
    },
    { headers: { "content-type": "application/json" } }
  );
}

async function assetCount() {
  const token = await getToken();

  const listAssetResponse = await axios.get(
    "https://api.dev.lynkwell.com/asset-management/v1/assets",
    {
      headers: { Authorization: `Bearer ${token.data.access_token}` },
    }
  );

  return JSON.stringify({ count: listAssetResponse.data.data.items.length });
}

async function remoteStart(stationID, idTag) {
  const token = await getToken();
  await axios.post(
    "https://api.dev.lynkwell.com/ocpp/v1/remote-start-transaction",
    {
      requestId: "req123",
      chargingStationId: stationID,
      connectorId: 1,
      idTag,
    },
    {
      headers: { Authorization: `Bearer ${token.data.access_token}` },
    }
  );

  return JSON.stringify({ success: true });
}

async function runConversation() {
  // Step 1: send the conversation and available functions to GPT
  const messages = [
    // {
    //   role: "user",
    //   content:
    //     "Please remote start station with ID as_espYYLSTVvXpdXHLEpzS1 with idTag M8V55DP0PZ7WHO0X1C7O",
    // },
    {
      role: "user",
      content: "How many assets are in the system?",
    },
  ];
  const functions = [
    {
      name: "asset_count",
      description: "Get the number of assets in the system",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "remote_start",
      description: "Remote start a station",
      parameters: {
        type: "object",
        properties: {
          stationID: {
            type: "string",
          },
          idTag: {
            type: "string",
          },
        },
        required: ["stationID", "idTag"],
      },
    },
  ];

  messages.map((m) => {
    console.log("Prompt:", m.content);
  });

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: messages,
    functions: functions,
    function_call: "auto", // auto is default, but we'll be explicit
  });
  const responseMessage = response.choices[0].message;
  // Step 2: check if GPT wanted to call a function

  if (responseMessage.function_call) {
    // Step 3: call the function
    // Note: the JSON response may not always be valid; be sure to handle errors
    const availableFunctions = {
      asset_count: assetCount,
      remote_start: remoteStart,
    }; // only one function in this example, but you can have multiple
    const functionName = responseMessage.function_call.name;
    const functionToCall = availableFunctions[functionName];
    const functionArgs = JSON.parse(responseMessage.function_call.arguments);
    const functionResponse = await functionToCall(
      functionArgs.stationID,
      functionArgs.idTag
    );

    // Step 4: send the info on the function call and function response to GPT
    messages.push(responseMessage); // extend conversation with assistant's reply

    messages.push({
      role: "function",
      name: functionName,
      content: functionResponse,
    }); // extend conversation with function response

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
    }); // get a new response from GPT where it can see the function response
    return secondResponse;
  }
}

runConversation()
  .then((r) => console.log("Response:", r.choices[0].message.content))
  .catch(console.error);
