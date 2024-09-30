// Import required modules
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
require("dotenv").config();
const { ObjectId } = require("mongodb");
const { MongoClient, ServerApiVersion } = require("mongodb");

// const dotenv = require("dotenv");

// dotenv.config();

// Initialize the Express app
const app = express();
const port = process.env.X_ZOHO_CATALYST_LISTEN_PORT || 3000;

// Middleware to prevent caching
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store"); // Prevent caching
  res.setHeader("Pragma", "no-cache"); // For older HTTP/1.0 clients
  res.setHeader("Expires", "0"); // Forces caches to fetch updated content
  next();
});

// Middleware for parsing request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware setup
app.use(
  session({
    secret: "your_secret_key", // Change this to a random string for security
    resave: false,
    saveUninitialized: true,
  })
);
// Import the MongoClient class from the mongodb package

// MongoDB connection URI (replace the password and other details as necessary)
const uri =
  "mongodb+srv://fazilniyazdeen:12345@cluster0.iq3oa66.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a new instance of MongoClient, setting the Server API version (v1 is common)
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1, // Removed unsupported options (strict, deprecationErrors)
});

// Function to connect to MongoDB and handle errors
async function connectDB() {
  try {
    // Attempt to connect to MongoDB
    await client.connect();

    // Send a ping to verify the connection (this command simply checks the status)
    await client.db("admin").command({ ping: 1 });

    // If the ping is successful, log the following message
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    // If there is an error during connection, log the error message
    console.error("Connection to MongoDB failed:", error);
  }
}

// Call the connectDB function to initiate the connection
connectDB();

// Serve static files (optional)
app.use(express.static("public"));

// Set the view engine to EJS
app.set("view engine", "ejs");

// Validation function for name, email, and password
function validateSignupInput(name, email, password) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/; // Updated regex

  if (!name || name.length < 3) {
    return "Name must be at least 3 characters long";
  }
  if (!emailRegex.test(email)) {
    return "Invalid email format";
  }
  if (!passwordRegex.test(password)) {
    return "Password must be at least 8 characters long, include one uppercase letter, one number, and one symbol";
  }

  return null; // No error
}

// Middleware to prevent back navigation to login/signup if already logged in
app.use((req, res, next) => {
  if (req.session.user) {
    if (req.path === "/login" || req.path === "/signup") {
      return res.redirect("/"); // Redirect to home if already logged in
    }
  }
  next(); // Proceed to the next middleware
});

// Home route
app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login"); // Redirect to login if not logged in
  }
  res.render("home", { user: req.session.user });
});

// Login route
app.get("/login", (req, res) => {
  res.render("login", {
    credintialsMissing: req.session.credintialsMissing,
    InvalidCredintials: req.session.InvalidCredintials,
  });
  req.session.credintialsMissing = false;
  req.session.InvalidCredintials = false;
});

// Signup route
app.get("/signup", (req, res) => {
  res.render("signup");
});

// Login POST request
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await client
    .db("all_users")
    .collection("Users")
    .findOne({ email });

  if (user && user.password === password) {
    req.session.user = user; // Set session variable
    return res.redirect("/"); // Redirect to home
  } else {
    req.session.InvalidCredintials = true;
    return res.redirect("/login"); // Redirect back to login on failure
  }
});

// Signup POST request
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const error = validateSignupInput(name, email, password);

  if (error) {
    return res.send(error);
  }

  await client
    .db("all_users")
    .collection("Users")
    .insertOne({ name, email, password });
  req.session.user = { name, email }; // Set session variable
  res.redirect("/"); // Redirect to home
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send("Error logging out");
    }
    res.redirect("/login");
  });
});

// Admin login GET route
app.get("/admin-login", (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin-dashboard"); // If already logged in, redirect to admin dashboard
  }
  res.render("admin-login", {
    InvalidAdminCredentials: req.session.InvalidAdminCredentials,
  });
  req.session.InvalidAdminCredentials = false;
});

// Admin login POST request
app.post("/admin-login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true; // Set admin session
    return res.redirect("/admin-dashboard"); // Redirect to admin dashboard
  } else {
    req.session.InvalidAdminCredentials = true;
    return res.redirect("/admin-login"); // Redirect back on invalid credentials
  }
});

// Admin logout
app.get("/admin-logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send("Error logging out admin");
    }
    res.redirect("/admin-login");
  });
});

// Admin dashboard with search functionality
app.get("/admin-dashboard", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin-login"); // Redirect to admin login if not logged in
  }

  const searchQuery = req.query.search || ""; // Get search query from URL, default to an empty string
  const searchFilter = searchQuery
    ? {
        $or: [
          { name: { $regex: searchQuery, $options: "i" } }, // Case-insensitive regex search on 'name'
          { email: { $regex: searchQuery, $options: "i" } }, // Case-insensitive regex search on 'email'
        ],
      }
    : {}; // If no search query, return all users

  try {
    const users = await client
      .db("all_users")
      .collection("Users")
      .find(searchFilter)
      .toArray();

    // Render admin dashboard with filtered user data and the search query
    res.render("admin-dashboard", { users, searchQuery });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.send("Error fetching users.");
  }
});

// GET route to display the create user form
app.get("/create-user", (req, res) => {
  res.render("create-user");
});

// POST route to handle creating a new user
app.post("/create-user", async (req, res) => {
  const { name, email, password } = req.body;
  const error = validateSignupInput(name, email, password);

  if (error) {
    return res.send(error); // You can display error in the form
  }

  await client
    .db("all_users")
    .collection("Users")
    .insertOne({ name, email, password });

  res.redirect("/admin-dashboard"); // Redirect back to the dashboard after creating
});

// GET route to display the edit user form
app.get("/edit-user/:id", async (req, res) => {
  const userId = req.params.id;

  const user = await client
    .db("all_users")
    .collection("Users")
    .findOne({ _id: new ObjectId(userId) });

  res.render("edit-user", { user });
});

// POST route to handle updating the user
// POST route to handle updating the user
app.post("/edit-user/:id", async (req, res) => {
  const userId = req.params.id;
  let { name, email, password } = req.body;

  // Trim the input values to remove extra spaces
  name = name.trim();
  email = email.trim();
  password = password.trim();

  // Validate that none of the fields are empty after trimming
  if (name === "" || email === "" || password === "") {
    console.log(
      "Name, email, and password cannot be empty or contain only spaces"
    );
    return res.send(
      "Name, email, and password cannot be empty or contain only spaces"
    ); // Return error message to the user
  }

  try {
    await client
      .db("all_users")
      .collection("Users")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $set: { name, email, password } }
      );

    res.redirect("/admin-dashboard"); // Redirect to admin dashboard after a successful update
  } catch (error) {
    console.error("Error updating user:", error);
    res.send("Error updating user."); // Handle error case
  }
});

// POST route to delete a user
app.post("/delete-user/:id", async (req, res) => {
  const userId = req.params.id;

  await client
    .db("all_users")
    .collection("Users")
    .deleteOne({ _id: new ObjectId(userId) });

  res.redirect("/admin-dashboard");
});

// Server listener
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
