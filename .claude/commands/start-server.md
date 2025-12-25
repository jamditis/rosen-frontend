Start the local development HTTP server for the Jay Rosen Digital Archive.

Run the following command:
```bash
cd /home/user/rosen-frontend && python3 -m http.server 8000
```

After starting, the archive will be available at:
- Main archive: http://localhost:8000
- Dissertation landing: http://localhost:8000/labs/dissertation-launch/landing-page/
- FAQ: http://localhost:8000/features/faq/
- Glossary: http://localhost:8000/features/glossary/

If the port is already in use, kill the existing process first:
```bash
lsof -ti:8000 | xargs kill -9
```
