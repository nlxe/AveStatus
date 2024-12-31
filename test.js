const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const yaml = require('js-yaml');  // Import the YAML library

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuration file path
const configPath = path.join(__dirname, 'config.yaml');

// Utility to read the config YAML file
function readConfig() {
    if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        return yaml.load(fileContents);
    }
    return {};
}

// Utility to write to the config YAML file
function writeConfig(config) {
    const yamlData = yaml.dump(config);
    fs.writeFileSync(configPath, yamlData, 'utf8');
}

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.render('index', { nodes: null, error: null, loading: false });
});

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
        console.error('Error fetching nodes from Pterodactyl API:', error.message);
        return null;
    }
}

async function checkNodeStatus(fqdn) {
    const url = `https://${fqdn}:8080`;

    try {
        console.log(`Checking node status for ${fqdn} with URL: ${url}`);
        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.error === "The required authorization heads were not present in the request.") {
            console.log(`Node ${fqdn} is Online (Authorization error)`);
            return 'Online';
        }

        return 'Offline';
    } catch (error) {
        console.error(`Error checking node status for ${fqdn}: ${error.message}`);
        if (error.response && error.response.status === 401 && error.response.data.error === "The required authorization heads were not present in the request.") {
            console.log(`Node ${fqdn} is Online (Authorization error handled)`);
            return 'Online';
        }

        return 'Offline';
    }
}

app.post('/', async (req, res) => {
    const { panel_url, api_key } = req.body;

    if (!panel_url || !api_key) {
        return res.render('index', { nodes: null, error: 'Both Panel URL and API Key are required.', loading: false });
    }

    try {
        const nodes = await getNodesStatus(panel_url, api_key);

        if (!nodes) {
            return res.render('index', { nodes: null, error: 'Invalid Panel URL or API Key. Please try again.', loading: false });
        }

        // Fetch node visibility setting from config.yaml
        const config = readConfig();
        const nodeVisibility = config.nodeVisibility || 'yes'; // Default to 'yes' if not set

        // Only display nodes based on visibility setting
        if (nodeVisibility === 'yes') {
            for (let node of nodes) {
                node.status = await checkNodeStatus(node.attributes.fqdn);
            }
        } else {
            nodes.length = 0;  // Hide all nodes if visibility is set to 'no'
        }

        res.render('index', { nodes, error: null, loading: false });
    } catch (error) {
        console.error("Error during API calls:", error);
        res.render('index', { nodes: null, error: 'An error occurred while fetching node statuses.', loading: false });
    }
});

app.listen(PORT, () => {
    console.log(`Ave Status is running on http://localhost:${PORT}`);
});
