require("dotenv").config();

const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const app = express();
const PORT = process.env.PORT || 3000;
// ==========================================
// BOOKING DATABASE
// ==========================================

const db = new sqlite3.Database("./bookings.db", (error) => {

    if (error) {
        console.error("DATABASE CONNECTION FAILED ❌");
        console.error(error);
    } else {
        console.log("BOOKING DATABASE CONNECTED ✅");
    }

});

db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT UNIQUE,
        package_name TEXT,
        name TEXT,
        email TEXT,
        phone TEXT,
        booking_date TEXT,
        booking_time TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (error) => {

    if (error) {
        console.error("DATABASE TABLE CREATION FAILED ❌");
        console.error(error);
    } else {
        console.log("BOOKINGS TABLE READY ✅");
    }

});
// ==========================================
// CONTACT MESSAGES DATABASE
// ==========================================

db.run(`
    CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        destination TEXT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (error) => {

    if (error) {
        console.error("CONTACT TABLE CREATION FAILED ❌");
        console.error(error);
    } else {
        console.log("CONTACT MESSAGES TABLE READY ✅");
    }

});
// ==========================================
// PACKAGES DATABASE
// ==========================================

db.run(`
    CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        destination TEXT,
        duration TEXT,
        price REAL,
        description TEXT,
        image TEXT,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (error) => {

    if (error) {

        console.error("PACKAGES TABLE CREATION FAILED ❌");
        console.error(error);

    } else {

        console.log("PACKAGES TABLE READY ✅");
// ==========================================
// ADD DEFAULT TRAVEL PACKAGES
// ==========================================

const defaultPackages = [
    {
        name: "Goa Holiday",
        destination: "Goa",
        duration: "3 Days / 2 Nights",
        price: 8999,
        description: "Enjoy beautiful beaches, amazing views and a relaxing Goa holiday.",
        image: "🏖️"
    },
    {
        name: "Manali Adventure",
        destination: "Manali",
        duration: "5 Days / 4 Nights",
        price: 12999,
        description: "Enjoy beautiful mountains, amazing views and an exciting Manali adventure.",
        image: "🏔️"
    },
    {
        name: "Kashmir Paradise",
        destination: "Kashmir",
        duration: "6 Days / 5 Nights",
        price: 16999,
        description: "Explore the beautiful valleys, mountains and peaceful scenery of Kashmir.",
        image: "🌄"
    },
    {
        name: "Jaipur Royal Tour",
        destination: "Jaipur",
        duration: "4 Days / 3 Nights",
        price: 10999,
        description: "Explore beautiful forts, palaces and the royal culture of Jaipur.",
        image: "🏰"
    },
    {
        name: "Kerala Paradise",
        destination: "Kerala",
        duration: "5 Days / 4 Nights",
        price: 14999,
        description: "Enjoy Kerala's beautiful beaches, backwaters, greenery and peaceful views.",
        image: "🌿"
    }
];

defaultPackages.forEach((pkg) => {

    db.run(
        `
        INSERT INTO packages
        (
            name,
            destination,
            duration,
            price,
            description,
            image,
            status
        )
        SELECT ?, ?, ?, ?, ?, ?, 'Active'
        WHERE NOT EXISTS (
            SELECT 1 FROM packages WHERE name = ?
        )
        `,
        [
            pkg.name,
            pkg.destination,
            pkg.duration,
            pkg.price,
            pkg.description,
            pkg.image,
            pkg.name
        ],
        (error) => {

            if (error) {

                console.error(
                    `PACKAGE INSERT FAILED ❌ ${pkg.name}`
                );

                console.error(error);

            } else {

                console.log(
                    `PACKAGE READY ✅ ${pkg.name}`
                );

            }

        }
    );

});
    }

});
// Middleware
// ==========================================
// ADMIN LOGIN SESSION
// ==========================================

app.use(
    session({
        secret: process.env.SESSION_SECRET || "rahul-travel-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ==========================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ==========================================

function requireAdmin(req, res, next) {

    if (!req.session.isAdminLoggedIn) {

        return res.status(401).json({
            success: false,
            message: "Admin login required."
        });

    }

    next();
}
// ==========================================
// ADMIN LOGIN API
// ==========================================

app.post("/api/admin/login", (req, res) => {

    const { username, password } = req.body;

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (
        username !== adminUsername ||
        password !== adminPassword
    ) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
        });
    }

    req.session.isAdminLoggedIn = true;
    req.session.adminUsername = username;

    console.log("ADMIN LOGIN SUCCESS ✅");

    res.json({
        success: true,
        message: "Login successful."
    });

});


// ==========================================
// ADMIN LOGOUT API
// ==========================================

app.post("/api/admin/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            console.error("ADMIN LOGOUT FAILED ❌");
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Logout failed."
            });
        }

        console.log("ADMIN LOGOUT SUCCESS ✅");

        res.json({
            success: true,
            message: "Logout successful."
        });

    });

});
// ==========================================
// PROTECT ADMIN DASHBOARD
// ==========================================

app.get("/admin.html", (req, res) => {

    if (!req.session.isAdminLoggedIn) {

        return res.redirect("/admin-login.html");

    }

    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );

});
// Serve website
app.use(express.static(path.join(__dirname, "public")));

// Brevo Email API
const transporter = {
    sendMail: async function (mailOptions, callback) {
        try {
            const toList = Array.isArray(mailOptions.to)
                ? mailOptions.to.map(email =>
                    typeof email === "string" ? { email } : email
                )
                : [{ email: mailOptions.to }];

            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "api-key": process.env.BREVO_API_KEY,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    sender: {
                        email: process.env.EMAIL_USER,
                        name: "Rahul Travel"
                    },
                    to: toList,
                    subject: mailOptions.subject || "",
                    htmlContent: mailOptions.html || "",
                    textContent: mailOptions.text || ""
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.message || `Brevo API error: ${response.status}`
                );
            }

            const info = {
                messageId: data.messageId
            };

            console.log("BREVO EMAIL SENT ✅");

            if (callback) {
                callback(null, info);
            }

            return info;

        } catch (error) {
            console.error("BREVO EMAIL FAILED ❌");
            console.error(error);

            if (callback) {
                callback(error);
            }

            throw error;
        }
    }
};


// ==========================================
// CONTACT MESSAGE
// ==========================================

app.post("/send-message", async (req, res) => {

    console.log("=================================");
    console.log("MESSAGE REQUEST RECEIVED");
    console.log("=================================");

    console.log("Request data:", req.body);

    const { name, email, destination, message } = req.body;

if (!name || !email || !message) {

    return res.status(400).json({
        success: false,
        message: "Please fill all required fields."
    });

}


// ==========================================
// SAVE CONTACT MESSAGE TO DATABASE
// ==========================================

await new Promise((resolve, reject) => {

    db.run(
        `
        INSERT INTO contact_messages
        (
            name,
            email,
            destination,
            message
        )
        VALUES (?, ?, ?, ?)
        `,
        [
            name,
            email,
            destination,
            message
        ],
        function (error) {

            if (error) {

                console.error("CONTACT MESSAGE SAVE FAILED ❌");
                console.error(error);

                reject(error);

            } else {

                console.log("CONTACT MESSAGE SAVED ✅");
                console.log("Message Record ID:", this.lastID);

                resolve();

            }

        }
    );

});

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: email,
        subject: `New Rahul Travel Message from ${name}`,

        html: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;">

            <div style="background:#0d6efd;color:white;padding:20px;text-align:center;">
                <h1 style="margin:0;">RAHUL TRAVEL</h1>
                <p style="margin:5px 0;">New Customer Message</p>
            </div>

            <div style="padding:25px;">

                <h2 style="color:#0d6efd;">Customer Details</h2>

                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Destination:</strong> ${destination || "Not provided"}</p>

                <h2 style="color:#0d6efd;">Message</h2>

                <div style="background:#f5f5f5;padding:15px;border-radius:8px;">
                    ${message}
                </div>

            </div>

            <div style="background:#f5f5f5;padding:15px;text-align:center;color:#666;">
                Rahul Travel
            </div>

        </div>
        `
    };

    try {

        const info = await transporter.sendMail(mailOptions);

        console.log("EMAIL SENT SUCCESSFULLY ✅");
        console.log("Message ID:", info.messageId);

        res.json({
            success: true,
            message: "Message sent successfully!"
        });

    } catch (error) {

        console.error("EMAIL SEND FAILED ❌");
        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// ==========================================
// BOOKING
// ==========================================

app.post("/send-booking", async (req, res) => {

    console.log("=================================");
    console.log("BOOKING REQUEST RECEIVED");
    console.log("=================================");

    console.log("Booking data:", req.body);

    const { packageName, name, email, phone } = req.body;

    if (!packageName || !name || !email || !phone) {

        return res.status(400).json({
            success: false,
            message: "Please fill all booking fields."
        });

    }


    // ==========================================
    // CREATE BOOKING ID
    // ==========================================

    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();

    const today = new Date();

    const datePart =
        today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");

    const bookingId = `RT-${datePart}-${randomPart}`;


    // ==========================================
    // DATE & TIME
    // ==========================================

    const bookingDate = today.toLocaleDateString("en-IN");

    const bookingTime = today.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });


    console.log("Booking ID:", bookingId);
    console.log("Booking Date:", bookingDate);
    console.log("Booking Time:", bookingTime);
// ==========================================
// SAVE BOOKING TO DATABASE
// ==========================================

await new Promise((resolve, reject) => {

    db.run(
        `
        INSERT INTO bookings
        (
            booking_id,
            package_name,
            name,
            email,
            phone,
            booking_date,
            booking_time,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            bookingId,
            packageName,
            name,
            email,
            phone,
            bookingDate,
            bookingTime,
            "Pending"
        ],
        function (error) {

            if (error) {

                console.error("BOOKING DATABASE SAVE FAILED ❌");
                console.error(error);

                reject(error);

            } else {

                console.log("BOOKING SAVED TO DATABASE ✅");
                console.log("Database Record ID:", this.lastID);

                resolve();

            }

        }
    );

});

    // ==========================================
    // EMAIL TO RAHUL TRAVEL
    // ==========================================

    const adminMail = {

        from: process.env.EMAIL_USER,

        to: process.env.EMAIL_USER,

        replyTo: email,

        subject: `New Booking ${bookingId} - ${packageName}`,

        html: `

        <div style="
            font-family:Arial,sans-serif;
            max-width:700px;
            margin:auto;
            border:1px solid #ddd;
            border-radius:12px;
            overflow:hidden;
        ">

            <div style="
                background:#0d6efd;
                color:white;
                padding:25px;
                text-align:center;
            ">

                <h1 style="margin:0;">
                    RAHUL TRAVEL
                </h1>

                <p style="margin:8px 0 0;">
                    New Booking Received
                </p>

            </div>


            <div style="padding:25px;">

                <div style="
                    background:#e8f3ff;
                    padding:15px;
                    border-radius:8px;
                    margin-bottom:20px;
                ">

                    <h2 style="
                        margin:0;
                        color:#0d6efd;
                    ">
                        Booking ID: ${bookingId}
                    </h2>

                </div>


                <h2>Booking Details</h2>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                ">

                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Package</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${packageName}
                        </td>
                    </tr>


                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Booking Date</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${bookingDate}
                        </td>
                    </tr>


                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Booking Time</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${bookingTime}
                        </td>
                    </tr>

                </table>


                <h2 style="margin-top:30px;">
                    Customer Details
                </h2>


                <table style="
                    width:100%;
                    border-collapse:collapse;
                ">

                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Name</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${name}
                        </td>
                    </tr>


                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Email</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${email}
                        </td>
                    </tr>


                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            <strong>Phone</strong>
                        </td>

                        <td style="padding:10px;border-bottom:1px solid #ddd;">
                            ${phone}
                        </td>
                    </tr>

                </table>


                <div style="
                    margin-top:30px;
                    background:#f5f5f5;
                    padding:15px;
                    border-radius:8px;
                ">

                    <strong>Action Required:</strong>

                    <p style="margin-bottom:0;">
                        Please contact the customer to confirm the booking.
                    </p>

                </div>

            </div>


            <div style="
                background:#f5f5f5;
                padding:15px;
                text-align:center;
                color:#666;
            ">

                Rahul Travel • Travel • Discover • Enjoy

            </div>

        </div>

        `
    };


    // ==========================================
    // EMAIL TO CUSTOMER
    // ==========================================

    const customerMail = {

        from: process.env.EMAIL_USER,

        to: email,

        subject: `Rahul Travel Booking Confirmation - ${bookingId}`,

        html: `

        <div style="
            font-family:Arial,sans-serif;
            max-width:650px;
            margin:auto;
            border:1px solid #ddd;
            border-radius:12px;
            overflow:hidden;
        ">


            <div style="
                background:#198754;
                color:white;
                padding:25px;
                text-align:center;
            ">

                <h1 style="margin:0;">
                    RAHUL TRAVEL
                </h1>

                <p style="margin:8px 0 0;">
                    Booking Confirmation
                </p>

            </div>


            <div style="padding:25px;">

                <h2>
                    Hello ${name}! 👋
                </h2>

                <p>
                    Thank you for choosing Rahul Travel.
                    Your booking request has been received successfully.
                </p>


                <div style="
                    background:#e8f5e9;
                    padding:18px;
                    border-radius:8px;
                    margin:20px 0;
                ">

                    <h2 style="
                        color:#198754;
                        margin:0 0 10px;
                    ">
                        Booking ID: ${bookingId}
                    </h2>

                    <p style="margin:5px 0;">
                        <strong>Package:</strong> ${packageName}
                    </p>

                    <p style="margin:5px 0;">
                        <strong>Date:</strong> ${bookingDate}
                    </p>

                    <p style="margin:5px 0;">
                        <strong>Time:</strong> ${bookingTime}
                    </p>

                </div>


                <h3>Customer Details</h3>

                <p>
                    <strong>Name:</strong> ${name}
                </p>

                <p>
                    <strong>Email:</strong> ${email}
                </p>

                <p>
                    <strong>Phone:</strong> ${phone}
                </p>


                <div style="
                    margin-top:25px;
                    padding:15px;
                    background:#fff3cd;
                    border-radius:8px;
                ">

                    <strong>Important:</strong>

                    <p style="margin-bottom:0;">
                        This is a booking request confirmation.
                        Our travel team will contact you shortly
                        to confirm the final booking.
                    </p>

                </div>

            </div>


            <div style="
                background:#f5f5f5;
                padding:20px;
                text-align:center;
                color:#666;
            ">

                <strong>Rahul Travel</strong>

                <br>

                Travel • Discover • Enjoy

            </div>

        </div>

        `
    };


    // ==========================================
    // SEND BOTH EMAILS
    // ==========================================

    try {

        // Send email to Rahul Travel
        const adminInfo = await transporter.sendMail(adminMail);

        console.log("ADMIN BOOKING EMAIL SENT ✅");
        console.log("Admin Message ID:", adminInfo.messageId);


        // Send confirmation to customer
        const customerInfo = await transporter.sendMail(customerMail);

        console.log("CUSTOMER CONFIRMATION EMAIL SENT ✅");
        console.log("Customer Message ID:", customerInfo.messageId);


        console.log("=================================");
        console.log("BOOKING COMPLETED SUCCESSFULLY ✅");
        console.log("Booking ID:", bookingId);
        console.log("=================================");


        res.json({

            success: true,

            message: "Booking submitted successfully!",

            bookingId: bookingId,

            bookingDate: bookingDate,

            bookingTime: bookingTime

        });


    } catch (error) {

        console.error("BOOKING EMAIL FAILED ❌");
        console.error(error);

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

});
// ==========================================
// CUSTOMER BOOKING LOOKUP
// ==========================================

app.get("/api/booking/:bookingId", (req, res) => {

    const { bookingId } = req.params;

    if (!bookingId) {
        return res.status(400).json({
            success: false,
            message: "Booking ID is required."
        });
    }

    db.get(
        `
        SELECT
            booking_id,
            package_name,
            name,
            email,
            phone,
            booking_date,
            booking_time,
            status
        FROM bookings
        WHERE booking_id = ?
        `,
        [bookingId],
        (error, booking) => {

            if (error) {

                console.error("BOOKING LOOKUP FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to find booking."
                });
            }

            if (!booking) {

                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });
            }

            res.json({
                success: true,
                booking: booking
            });

        }
    );

});
// ===============================
// GET BOOKING BY BOOKING ID
// ===============================
// ==========================================
// DELETE BOOKING
// ==========================================

app.delete("/api/bookings/:bookingId", requireAdmin, (req, res) => {

    const { bookingId } = req.params;

    db.run(
        "DELETE FROM bookings WHERE booking_id = ?",
        [bookingId],
        function (error) {

            if (error) {

                console.error(
                    "BOOKING DELETE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: "Failed to delete booking."
                });

            }

            if (this.changes === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });

            }

            console.log(
                `BOOKING DELETED ✅ ${bookingId}`
            );

            res.json({
                success: true,
                message: "Booking deleted successfully."
            });

        }
    );

});
app.get("/api/bookings/:bookingId", (req, res) => {
    const bookingId = req.params.bookingId;

    db.get(
        "SELECT * FROM bookings WHERE booking_id = ?",
        [bookingId],
        (error, booking) => {

            if (error) {
                console.error("BOOKING LOOKUP FAILED ❌", error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to find booking."
                });
            }

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });
            }

            res.json({
                success: true,
                booking: booking
            });
        }
    );
});
// ==========================================
// GET ALL BOOKINGS
// ==========================================

app.get("/api/bookings", requireAdmin, (req, res) => {

    db.all(
        `
        SELECT *
        FROM bookings
        ORDER BY id DESC
        `,
        [],
        (error, rows) => {

            if (error) {

                console.error("BOOKINGS FETCH FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch bookings."
                });

            }

            res.json({
                success: true,
                bookings: rows
            });

        }
    );

});
// ==========================================
// ADMIN CONTACT MESSAGES API
// ==========================================

app.get("/api/contact-messages", requireAdmin, (req, res) => {

    db.all(
        `
        SELECT *
        FROM contact_messages
        ORDER BY id DESC
        `,
        [],
        (error, rows) => {

            if (error) {

                console.error("CONTACT MESSAGES FETCH FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch contact messages."
                });

            }

            res.json({
                success: true,
                messages: rows
            });

        }
    );

});
// ==========================================
// DELETE CONTACT MESSAGE
// ==========================================

app.delete("/api/contact-messages/:id", requireAdmin, (req, res) => {

    const { id } = req.params;

    db.run(
        "DELETE FROM contact_messages WHERE id = ?",
        [id],
        function (error) {

            if (error) {

                console.error("CONTACT MESSAGE DELETE FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to delete contact message."
                });

            }

            if (this.changes === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Contact message not found."
                });

            }

            console.log(
                `CONTACT MESSAGE DELETED ✅ ID: ${id}`
            );

            res.json({
                success: true,
                message: "Contact message deleted successfully."
            });

        }
    );

});
// ==========================================
// REPLY TO CUSTOMER CONTACT MESSAGE
// ==========================================

app.post("/api/contact-messages/reply", requireAdmin, async (req, res) => {

    const { email, name, subject, reply } = req.body;

    // Check required fields
    if (!email || !reply) {

        return res.status(400).json({
            success: false,
            message: "Email and reply are required."
        });

    }

    // ==========================================
    // EMAIL TO CUSTOMER
    // ==========================================

    const customerReplyMail = {

        from: process.env.EMAIL_USER,

        to: email,

        subject: subject || "Reply from Rahul Travel",

        html: `
        <div style="
            font-family:Arial,sans-serif;
            max-width:650px;
            margin:auto;
            border:1px solid #ddd;
            border-radius:12px;
            overflow:hidden;
        ">

            <div style="
                background:#0d6efd;
                color:white;
                padding:25px;
                text-align:center;
            ">

                <h1 style="margin:0;">
                    ✈️ RAHUL TRAVEL
                </h1>

                <p style="margin:8px 0 0;">
                    Reply to Your Travel Inquiry
                </p>

            </div>

            <div style="padding:25px;">

                <h2>
                    Hello ${name || "Customer"},
                </h2>

                <p>
                    Thank you for contacting Rahul Travel.
                </p>

                <h3 style="color:#0d6efd;">
                    Our Reply
                </h3>

                <div style="
                    background:#f5f5f5;
                    padding:18px;
                    border-radius:8px;
                    line-height:1.6;
                ">
                    ${reply}
                </div>

                <p style="margin-top:25px;">
                    If you have any other questions, please feel free
                    to contact us again.
                </p>

                <p>
                    Regards,<br>
                    <strong>Rahul Travel</strong>
                </p>

            </div>

        </div>
        `
    };

    // ==========================================
    // SEND EMAIL
    // ==========================================

    try {

        await transporter.sendMail(customerReplyMail);

        console.log(
            `CUSTOMER REPLY EMAIL SENT ✅ → ${email}`
        );

        res.json({
            success: true,
            message: "Reply sent successfully."
        });

    } catch (error) {

        console.error(
            "CUSTOMER REPLY EMAIL FAILED ❌"
        );

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to send reply email."
        });

    }

});
// ==========================================
// DIRECT CUSTOMER EMAIL FROM ADMIN
// ==========================================

app.post("/api/send-customer-email", requireAdmin, async (req, res) => {

    const { email, name, subject, message } = req.body;

    // Check required fields
    if (!email || !message) {

        return res.status(400).json({
            success: false,
            message: "Customer email and message are required."
        });

    }

    const customerMail = {

        from: process.env.EMAIL_USER,

        to: email,

        subject: subject || "Message from Rahul Travel",

        html: `
        <div style="
            font-family:Arial,sans-serif;
            max-width:650px;
            margin:auto;
            border:1px solid #ddd;
            border-radius:12px;
            overflow:hidden;
        ">

            <div style="
                background:#0d6efd;
                color:white;
                padding:25px;
                text-align:center;
            ">

                <h1 style="margin:0;">
                    ✈️ RAHUL TRAVEL
                </h1>

                <p style="margin:8px 0 0;">
                    Message from Rahul Travel
                </p>

            </div>

            <div style="padding:25px;">

                <h2>
                    Hello ${name || "Customer"},
                </h2>

                <div style="
                    background:#f5f5f5;
                    padding:18px;
                    border-radius:8px;
                    line-height:1.6;
                    white-space:pre-wrap;
                ">
                    ${message}
                </div>

                <p style="margin-top:25px;">
                    Regards,<br>
                    <strong>Rahul Travel</strong>
                </p>

            </div>

        </div>
        `
    };

    try {

        await transporter.sendMail(customerMail);

        console.log(
            `DIRECT CUSTOMER EMAIL SENT ✅ → ${email}`
        );

        res.json({
            success: true,
            message: "Email sent successfully."
        });

    } catch (error) {

        console.error(
            "DIRECT CUSTOMER EMAIL FAILED ❌"
        );

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to send email."
        });

    }

});
// ==========================================
// UPDATE BOOKING STATUS
// ==========================================

// ==========================================
// UPDATE BOOKING STATUS + CUSTOMER EMAIL
// ==========================================
// ==========================================
// PACKAGE MANAGEMENT APIs
// ==========================================

// GET ALL PACKAGES
// ==========================================
// PUBLIC PACKAGES API
// ==========================================

app.get("/api/packages", (req, res) => {

    db.all(
        `
        SELECT
            id,
            name,
            destination,
            duration,
            price,
            description,
            image,
            status
        FROM packages
        WHERE status = 'Active'
        ORDER BY id DESC
        `,
        [],
        (error, rows) => {

            if (error) {

                console.error(
                    "PUBLIC PACKAGES API FAILED ❌"
                );

                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to load packages."
                });

            }

            res.json({
                success: true,
                packages: rows
            });

        }
    );

});
app.get("/api/admin/packages", requireAdmin, (req, res) => {

    db.all(
        `SELECT * FROM packages ORDER BY id DESC`,
        [],
        (error, rows) => {

            if (error) {

                console.error("GET PACKAGES FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to load packages."
                });

            }

            res.json({
                success: true,
                packages: rows
            });

        }
    );

});


// ADD NEW PACKAGE
app.post("/api/admin/packages", requireAdmin, (req, res) => {

    const {
        name,
        destination,
        duration,
        price,
        description,
        image,
        status
    } = req.body;

    if (!name || !destination || !duration || !price) {

        return res.status(400).json({
            success: false,
            message: "Name, destination, duration and price are required."
        });

    }

    db.run(
        `
        INSERT INTO packages
        (
            name,
            destination,
            duration,
            price,
            description,
            image,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
            name,
            destination,
            duration,
            Number(price),
            description || "",
            image || "",
            status || "Active"
        ],
        function (error) {

            if (error) {

                console.error("ADD PACKAGE FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to add package."
                });

            }

            res.json({
                success: true,
                message: "Package added successfully.",
                packageId: this.lastID
            });

        }
    );

});


// UPDATE PACKAGE
app.patch("/api/admin/packages/:id", requireAdmin, (req, res) => {

    const packageId = req.params.id;

    const {
        name,
        destination,
        duration,
        price,
        description,
        image,
        status
    } = req.body;

    if (!name || !destination || !duration || !price) {

        return res.status(400).json({
            success: false,
            message: "Name, destination, duration and price are required."
        });

    }

    db.run(
        `
        UPDATE packages
        SET
            name = ?,
            destination = ?,
            duration = ?,
            price = ?,
            description = ?,
            image = ?,
            status = ?
        WHERE id = ?
        `,
        [
            name,
            destination,
            duration,
            Number(price),
            description || "",
            image || "",
            status || "Active",
            packageId
        ],
        function (error) {

            if (error) {

                console.error("UPDATE PACKAGE FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to update package."
                });

            }

            if (this.changes === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Package not found."
                });

            }

            res.json({
                success: true,
                message: "Package updated successfully."
            });

        }
    );

});


// DELETE PACKAGE
app.delete("/api/admin/packages/:id", requireAdmin, (req, res) => {

    const packageId = req.params.id;

    db.run(
        `DELETE FROM packages WHERE id = ?`,
        [packageId],
        function (error) {

            if (error) {

                console.error("DELETE PACKAGE FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to delete package."
                });

            }

            if (this.changes === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Package not found."
                });

            }

            res.json({
                success: true,
                message: "Package deleted successfully."
            });

        }
    );

});
app.patch("/api/bookings/:bookingId/status", requireAdmin, (req, res) => {

    const { bookingId } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled"
    ];

    // Check status
    if (!allowedStatuses.includes(status)) {

        return res.status(400).json({
            success: false,
            message: "Invalid booking status."
        });

    }

    // ==========================================
    // GET CUSTOMER BOOKING DETAILS
    // ==========================================

    db.get(
        "SELECT * FROM bookings WHERE booking_id = ?",
        [bookingId],
        (error, booking) => {

            if (error) {

                console.error("BOOKING FETCH FAILED ❌");
                console.error(error);

                return res.status(500).json({
                    success: false,
                    message: "Failed to find booking."
                });

            }

            if (!booking) {

                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });

            }

            // ==========================================
            // UPDATE STATUS
            // ==========================================

            db.run(
                `
                UPDATE bookings
                SET status = ?
                WHERE booking_id = ?
                `,
                [status, bookingId],
                function (error) {

                    if (error) {

                        console.error("STATUS UPDATE FAILED ❌");
                        console.error(error);

                        return res.status(500).json({
                            success: false,
                            message: "Failed to update booking status."
                        });

                    }

                    console.log(
                        `BOOKING STATUS UPDATED ✅ ${bookingId} → ${status}`
                    );

                    // ==========================================
                    // SEND EMAIL TO CUSTOMER
                    // ==========================================

                    const customerMail = {

                        from: process.env.EMAIL_USER,

                        to: booking.email,

                        subject: `Booking ${bookingId} Status Updated - ${status}`,

                        html: `
                        
                        <div style="
                            font-family:Arial,sans-serif;
                            max-width:650px;
                            margin:auto;
                            border:1px solid #ddd;
                            border-radius:12px;
                            overflow:hidden;
                        ">

                            <div style="
                                background:#0d6efd;
                                color:white;
                                padding:25px;
                                text-align:center;
                            ">

                                <h1 style="margin:0;">
                                    RAHUL TRAVEL
                                </h1>

                                <p style="margin:8px 0 0;">
                                    Booking Status Update
                                </p>

                            </div>

                            <div style="padding:25px;">

                                <h2>Hello ${booking.name || "Customer"},</h2>

                                <p>
                                    Your booking status has been updated.
                                </p>

                                <p>
                                    <strong>Booking ID:</strong>
                                    ${booking.booking_id}
                                </p>

                                <p>
                                    <strong>Package:</strong>
                                    ${booking.package_name}
                                </p>

                                <p>
                                    <strong>Booking Date:</strong>
                                    ${booking.booking_date}
                                </p>

                                <p>
                                    <strong>Booking Time:</strong>
                                    ${booking.booking_time}
                                </p>

                                <div style="
                                    margin:25px 0;
                                    padding:18px;
                                    background:#f5f5f5;
                                    border-radius:8px;
                                    text-align:center;
                                ">

                                    <p style="margin:0 0 8px;">
                                        Current Status
                                    </p>

                                    <h2 style="margin:0;">
                                        ${status}
                                    </h2>

                                </div>

                                <p>
                                    Thank you for choosing Rahul Travel.
                                </p>

                                <p>
                                    Regards,<br>
                                    <strong>Rahul Travel</strong>
                                </p>

                            </div>

                        </div>

                        `
                    };

                    // Send email
                    transporter.sendMail(
                        customerMail,
                        (mailError, info) => {

                            if (mailError) {

                                console.error(
                                    "CUSTOMER EMAIL FAILED ❌"
                                );

                                console.error(mailError);

                            } else {

                                console.log(
                                    `CUSTOMER STATUS EMAIL SENT ✅ ${booking.email}`
                                );

                            }

                            // Response to admin
                            return res.json({
                                success: true,
                                message: "Booking status updated successfully.",
                                bookingId: bookingId,
                                status: status
                            });

                        }
                    );

                }
            );

        }
    );

});
// ==========================================
// ADMIN BOOKING DASHBOARD API
// ==========================================

app.get("/api/bookings", requireAdmin, (req, res) => {

    db.all(
        "SELECT * FROM bookings ORDER BY id DESC",
        [],
        (err, rows) => {

            if (err) {
                console.error("BOOKING FETCH ERROR:", err);

                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch bookings"
                });
            }

            res.json({
                success: true,
                bookings: rows
            });
        }
    );
});


// ==========================================
// START SERVER
// ==========================================
// ==========================================
// START SERVER
// ==========================================

const server = app.listen(PORT, () => {

    console.log("=================================");
    console.log(`Rahul Travel server running at http://localhost:${PORT}`);
    console.log("SERVER IS ALIVE ✅");
    console.log("=================================");

});

server.on("error", (error) => {

    console.error("SERVER ERROR ❌");
    console.error(error);

});

server.on("close", () => {

    console.log("SERVER CLOSED ❌");

});
