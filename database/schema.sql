-- ============================================================
-- Global India Digital Solution — PostgreSQL Database Setup
-- Database name: gids_database
-- ============================================================

-- Create the database as a superuser if it does not already exist.
-- PostgreSQL does not support CREATE DATABASE IF NOT EXISTS in all versions,
-- so run this only once or check manually before rerunning.
CREATE DATABASE gids_database;

\c gids_database;

-- Book a Consultation (Send Us a Message form)
CREATE TABLE IF NOT EXISTS consultations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  service_interest VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Enroll Now / Enroll (Exam Coaching + Skill Development cards)
CREATE TABLE IF NOT EXISTS enroll (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  phone_number VARCHAR(30) NOT NULL,
  email_address VARCHAR(200) NOT NULL,
  learning_mode VARCHAR(50) NOT NULL,
  course_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reviews / Testimonials
CREATE TABLE IF NOT EXISTS reviews_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(100) DEFAULT 'Learner',
  rating SMALLINT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users (verified accounts only)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(20),
  login_name VARCHAR(120),
  full_name VARCHAR(100),
  username VARCHAR(50),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pending Users (waiting for email verification)
CREATE TABLE IF NOT EXISTS pending_users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(20),
  login_name VARCHAR(120),
  full_name VARCHAR(100),
  username VARCHAR(50),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  verification_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
