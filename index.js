require('dotenv').config();  // Load environment variables from .env file
const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const yaml = require('js-yaml'); // Import the YAML library
const mongoose = require('mongoose');

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Load config file
const configPath = path.join(__dirname, 'config.yaml');

// Setup middlewares and view engine
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// Admin Panel Routes
app.get('/admin', (req, res) => {
    const config = readConfig();
    const { panel_url, api_key, nodeVisibility } = config;
    res.render('admin', { panel_url, api_key, nodeVisibility });
});

// Save Panel Config
app.post('/admin/save-config', async (req, res) => {
    const { panel_url, api_key } = req.body;
    let config = readConfig();

    config.panel_url = panel_url;
    config.api_key = api_key;

    // Fetch node information with allocations, location, and servers count
    try {
        const nodes = await getNodesStatus(panel_url, api_key);
        if (nodes) {
            config.nodes = nodes.map(node => ({
                name: node.name,
                fqdn: node.fqdn,
                memory: node.memory,
                disk: node.disk,
                location: node.location,
                
                status: 'Offline', // Set initial status to Offline (it will be updated)
            }));
        }
    } catch (error) {
        console.error('Error fetching nodes from Pterodactyl API:', error.message);
    }

    // Write the updated config to YAML file
    writeConfig(config);
    res.redirect('/admin');
});

// Save Node Visibility Config
app.post('/admin/save-nodes-config', (req, res) => {
    const { node_visibility } = req.body;
    let config = readConfig();

    config.nodeVisibility = node_visibility;

    writeConfig(config);

    res.redirect('/admin');
});

// Fetch Nodes Info from Pterodactyl API
async function getNodesStatus(PANEL_URL, API_KEY) {
    try {
        const response = await axios.get(`${PANEL_URL}/api/application/nodes`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
            },
        });

        // Extract relevant node data including memory, disk, servers count, and location
        const nodesData = response.data.data.map(node => {
            return {
                name: node.attributes.name,
                fqdn: node.attributes.fqdn,
                memory: node.attributes.memory,  // In MB
                disk: node.attributes.disk,  // In GB
                created_at: node.attributes.created_at,  // UTC timestamp
               
                status: 'Offline', // Default to Offline
            };
        });

        return nodesData;
    } catch (error) {
        console.error('Error fetching nodes from Pterodactyl API:', error.message);
        return null;
    }
}

// Check Node Status (Online/Offline)
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

// Home Route to Display Node Info
app.get('/', async (req, res) => {
    const config = readConfig();
    const nodes = config.nodes || [];
    const nodeVisibility = config.nodeVisibility || 'public'; // Default to 'public' if not set

    // Only display nodes based on visibility setting
    if (nodeVisibility === 'public') {
        // Fetch status for all nodes
        for (let node of nodes) {
            node.status = await checkNodeStatus(node.fqdn); // Update status (Online/Offline)
        }
    } else {
        nodes.length = 0;  // Hide all nodes if visibility is not public
    }

    res.render('index', { nodes, error: null, loading: false });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ave Status is running on http://localhost:${PORT}`);
});
