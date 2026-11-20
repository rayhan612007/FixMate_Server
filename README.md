<div align="center">

# ⚙️ FixMate Server — Backend API & Database Service

**RESTful backend service powering the FixMate repair booking platform with Express.js, native MongoDB, search filtering, and technician profile workflows.**

[![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-REST_API-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native_Driver-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)


</div>

---

## 📖 Overview

**FixMate Server** handles backend business logic, database operations, search queries, and service/technician data for the FixMate appliance and electronics repair platform. Built with **Node.js**, **Express**, and the **native MongoDB driver**, it is designed for fast queries, clean CRUD operations, and deployment on **Vercel**.

---

## ✨ Key Capabilities

- **🗄️ Native MongoDB Integration:** Uses the official `mongodb` driver directly (without Mongoose overhead) for flexible queries, aggregations, and document handling.
- **🔍 Multi-Field Search & Filtering:** Supports searching across key fields such as **service title**, **username**, **user email**, **product/appliance**, and **area/location**.
- **👨‍🔧 Technician & Service Data:** Serves structured service listings alongside technician profile information for service detail cards and booking flows.
- **🌐 CORS & Environment Ready:** Configured with environment variables for database credentials and cross-origin access from the client application.
- **☁️ Serverless / Cloud Deployment:** Ready to run locally or deploy on [Vercel](https://fix-mate-server-beta.vercel.app).

---

## 🧰 Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | **Node.js** | Server-side JavaScript execution |
| **Framework** | **Express.js** | HTTP routing, middleware, and REST API endpoints |
| **Database** | **MongoDB (Native Driver)** | Cloud/local NoSQL data persistence |
| **Hosting** | **Vercel** | Production deployment (`fix-mate-server-beta.vercel.app`) |

---

## 📂 Project Structure

```bash
FixMate_Server/
├── src/                    # Modular routes, controllers, helpers, or service logic
├── server.js               # Main Express application entry point & routes
├── package.json            # Project dependencies and npm scripts
├── package-lock.json       # Exact locked dependency tree
└── .gitignore              # Ignored files (node_modules, .env, build artifacts)
