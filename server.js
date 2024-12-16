const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const https = require('https'); // Required for handling HTTPS requests
const app = express();

// Set up express to handle POST requests and parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set the port
const PORT = process.env.PORT || 3000;

// Route to display the form and status page
app.get('/', (req, res) => {
    res.render('index', { nodes: null, error: null, loading: false });
});

// Fetch nodes data from the Pterodactyl API
async function getNodesStatus(PANEL_URL, API_KEY) {
    try {
        const response = await axios.get(`${PANEL_URL}/api/application/nodes`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
            },
        });
        return response.data.data;
    } catch (error) {
        return null; // Return null to indicate an error fetching the data
    }
}

// Function to check the status of each node using the fqdn
async function checkNodeStatus(fqdn) {
    try {
        // Log the curl command that will be executed
        const curlCommand = `curl -X GET https://${fqdn}:8080`;
        console.log(`Running curl command: ${curlCommand}`);

        const response = await axios.get(`https://${fqdn}:8080`, {
            timeout: 15000, // Increased timeout to 15 seconds
            httpsAgent: new https.Agent({
                rejectUnauthorized: false, // Disable SSL certificate validation (use with caution)
            }),
            headers: {
                'Authorization': 'Bearer ptla_uzgIw1WSAmChvAiE88GOYDXgavCGYB9bxJ1YHpJ0qkm', // Replace with your actual API key or token
            }
        });

        // Log the response
        console.log(`Response from ${fqdn}:`, response.data);

        // If the response contains the authorization error, mark the node as online
        if (response.data.error && response.data.error === "The required authorization headers were not present in the request.") {
            return 'Online'; // Node is considered online if this specific error is present
        }
        
        // If response does not contain the expected error, mark as offline
        return 'Offline'; // Otherwise, it's offline

    } catch (error) {
        console.error(`Error checking node status for ${fqdn}:`, error.message); // Log the error message for debugging
        if (error.response) {
            // Log the response status and data if available
            console.log(`Error response: Status ${error.response.status}, Data:`, error.response.data);
        }
        if (error.code === 'ECONNABORTED') {
            console.log(`Request for ${fqdn} timed out.`); // Specific handling for timeouts
        }
        return 'Offline'; // Mark as offline for any other errors (timeouts, network issues, etc.)
    }
}

// Handle form submission and validate
app.post('/', async (req, res) => {
    const { panel_url, api_key } = req.body;

    // Validate the input
    if (!panel_url || !api_key) {
        return res.render('index', { nodes: null, error: 'Both Panel URL and API Key are required.', loading: false });
    }

    // Show the loading spinner while fetching data
    const loading = true;
    const nodes = await getNodesStatus(panel_url, api_key);

    // Handle possible errors
    if (!nodes) {
        return res.render('index', { nodes: null, error: 'Invalid Panel URL or API Key. Please try again.', loading: false });
    }

    // Check the status of each node based on its fqdn
    for (let node of nodes) {
        node.status = await checkNodeStatus(node.attributes.fqdn); // Add node status
    }

    // If valid, render the node status page
    res.render('index', { nodes, error: null, loading: false });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
