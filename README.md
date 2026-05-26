# KRV Management — Task Based Workforce Management Portal

KRV Management is a modern, premium, and fully featured digital workforce portal. It allows candidates to sign up, complete KYC identity verifications, complete assigned digital tasks, submit proof-of-work, and withdraw earnings directly to their bank accounts after administrator audit verifications.

---

## 🚀 Live Demo & Sandbox Testing Guide

Since this is a client-side React SPA, **no complex database setups, npm installs, or environment configurations are required**. 
To open and run the entire portal:
1. **Double-click `index.html`** or serve it using a local static server (e.g. Live Server in VS Code, or python `-m http.server`).
2. Explore the full capabilities using the floating **⚡ Sandbox Switcher** at the bottom-left!

### End-to-End Test Workflow:
1. **Create Account**: Click "Sign Up" from the header and register a new candidate (e.g. `john@example.com` / `john123`).
2. **KYC Required Block**: Log in as John. Observe the yellow global notification warning that *KYC Approval is required to submit tasks*.
3. **Verify KYC**: Navigate to the "KYC Verification" side menu, enter bank accounts, upload Aadhaar card details/Selfie, and click "Submit KYC". Your status moves to "Pending".
4. **Switch to Admin**: Open the **⚡ Sandbox Switcher** at the bottom-left and select **👑 System Admin**.
5. **Approve KYC**: Go to **KYC Documents** in the Admin Sidebar, inspect John's uploaded bank details, and click **Approve**.
6. **Assign New Task**: Go to **Task CRUD** in the Admin Sidebar, click **Create New Task**, enter "Review KRV App" for ₹50 with a Play Store link, and click **Save & Assign**.
7. **Switch back to Candidate**: Click the Sandbox Switcher and select **John**. Observe the KYC warning is gone and status is approved!
8. **Complete & Submit Task**: Go to **Tasks**, browse the new task, copy the review link, click **Submit Task**, paste a Google Play link/upload a screenshot, and submit!
9. **Approve Submissions**: Switch to **System Admin**, navigate to **Task Reviews**, click **Audit Review** on John's submission, inspect proof links/files, and click **Approve Payout**.
10. **Withdraw Earnings**: Switch back to **John**. Observe the wallet balance has increased by ₹50! Go to **Earnings**, enter "50" under withdraw amount, and submit.
11. **Approve Bank Transfers**: Switch to **System Admin**, go to **Earnings Control**, check the pending bank transfer, and click **Approve Transfer** to release direct-to-bank payments!

---

## 🛠️ Technology Stack & Library CDNs

The portal relies on a high-performance Browser JIT compilation stack, letting you run complex React + Tailwind compilation natively:
* **Tailwind CSS v4 (JIT)**: Loaded via the official browser compiler `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>` for instant CSS utility injection, glassmorphism templates, and modern responsive grids.
* **React 18 & ReactDOM 18**: Dynamic core component logic, view routing, and reactive state management.
* **Babel Standalone**: Dynamically transpiles JSX syntax inside the browser.
* **Chart.js**: Powering the Admin Panel analytics, generating animated Daily Task Completion lines, Category distributions, and Candidate growth.
* **Harmonious Typography**: Inter font family for controls/text, Outfit font family for bold corporate headings.

---

## 📁 LocalStorage Data Schema

All candidate profiles, wallets, KYC identities, and task submissions are persisted live via browser `localStorage` across page reloads.

### `krv-users`
```json
[
  {
    "id": "c1",
    "name": "Rahul Sharma",
    "email": "rahul@gmail.com",
    "password": "rahul123",
    "mobile": "9988776655",
    "city": "Mumbai",
    "pincode": "400001",
    "referral_code": "KRV500",
    "wallet_balance": 750,
    "earnings_pending": 120,
    "earnings_paid": 2500,
    "kyc_status": "Approved",
    "role": "candidate"
  }
]
```

### `krv-tasks`
```json
[
  {
    "id": "t1",
    "title": "Install & Review Sakhicare App",
    "category": "Application Review",
    "links": "https://play.google.com/store/apps/details?id=com.sakhicare",
    "amount": 40,
    "remarks": "Install app and leave a 5-star review.",
    "deadline": "2026-06-15",
    "status": "Active"
  }
]
```

### `krv-submissions`
```json
[
  {
    "id": "s1",
    "user_id": "c1",
    "task_id": "t1",
    "submitted_link": "https://play.google.com/store/review?id=rahul",
    "screenshot": "blob:url/screenshot",
    "video": "",
    "remarks": "Reviewed on name Rahul Sharma",
    "review_status": "Approved",
    "amount": 40,
    "date": "2026-05-24"
  }
]
```

### `krv-kyc`
```json
[
  {
    "id": "k1",
    "user_id": "c1",
    "account_holder": "Rahul Sharma",
    "account_number": "998877665544",
    "bank_name": "HDFC Bank",
    "ifsc": "HDFC0001234",
    "aadhaar_front": "blob:url/front",
    "aadhaar_back": "blob:url/back",
    "selfie": "blob:url/selfie",
    "status": "Approved"
  }
]
```

---

## 📈 Production Grade Migration Roadmap

To transition this zero-config SPA prototype into a production full-stack **MERN (MongoDB + Express + React + Node.js)** architecture:

### 1. Backend Restructuring (Node.js & Express)
* **Initialize Node App**: Run `npm init -y` and install required dependencies: `express`, `mongoose`, `cors`, `dotenv`, `jsonwebtoken`, `bcryptjs`, `multer`.
* **API Structure**: Setup standard route modules:
  * `/api/auth`: Sign up, log in, secure token generation with JSON Web Tokens (JWT), OTP SMS verification.
  * `/api/candidates`: Profile management, security blocks.
  * `/api/tasks`: CRUD operations, assignments.
  * `/api/submissions`: Proof file uploads (using Multer), status audits.
  * `/api/kyc`: Identity verifications.
  * `/api/wallet`: Withdrawal requests, fund payouts.

### 2. Database Integration (MongoDB)
* Design Mongoose Schemas mirroring the LocalStorage structure.
* Enforce model validations and index fields:
  * Unique email and mobile constraints on User models.
  * Populate relationships: `submissions` references `userId` and `taskId`.

### 3. File Storage Upgrades (Cloudinary / AWS S3)
* Instead of storing screenshots/selfies as browser Base64/Blob strings, integrate **Cloudinary** or **AWS S3** SDK on the Node.js backend.
* Submissions store the secure HTTPS URLs returned by cloud storage.

### 4. Advanced Production Security Features
* **OTP Verification**: Integrate services like Twilio or Firebase Auth to verify mobile numbers during registration.
* **Email Broadcasts**: Setup Nodemailer or SendGrid to send notifications: "Task Approved", "KYC Approved", "Payment Released".
* **Anti-Spam & IP Tracking**: Track candidate submission IPs. Restrict submissions to unique devices and set limits on daily task completions per user.
