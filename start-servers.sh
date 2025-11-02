#!/bin/bash

# Start backend server in background
npm run server &

# Start frontend server in foreground
npm run dev
