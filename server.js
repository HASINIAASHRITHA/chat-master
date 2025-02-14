const express = require('express');
const path = require('path');
const app = express();

// Add security headers middleware
app.use((req, res, next) => {
    // Set SameSite attribute for cookies
    res.header('Set-Cookie', 'SameSite=Lax');
    res.header('Set-Cookie', 'Secure');
    
    // Security headers
    res.header('X-Frame-Options', 'DENY');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    next();
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Handle all routes by sending the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
