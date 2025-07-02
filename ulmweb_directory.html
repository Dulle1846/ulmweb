import requests
from bs4 import BeautifulSoup
import os

# --- Configuration ---
# Your GitHub repository details
GITHUB_REPO_OWNER = "Dulle1846"
GITHUB_REPO_NAME = "ulmweb"

# The name of the HTML file that this script will generate/update.
# This is used to identify the "current page" in the directory.
# This MUST match the filename you deploy on GitHub Pages (e.g., ulmweb_directory.html).
DIRECTORY_PAGE_FILENAME = "ulmweb_directory.html" # Updated to match your deployed filename

# Your GitHub Personal Access Token (PAT).
# It's highly recommended to set this as an environment variable for security,
# e.g., in your terminal: export GITHUB_TOKEN="YOUR_PAT_HERE"
# If your repository is public, a token might not be strictly necessary for basic file access,
# but it helps with GitHub API rate limits and ensures consistent access.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

# --- HTML Template Parts (from your original HTML) ---
# This section contains the static parts of your HTML directory page.
# The script will insert the dynamically generated site cards into this structure.
HTML_HEADER = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The UlmWeb - Site Directory</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.5;
            background-color: #000;
            color: #fff;
            min-height: 100vh;
        }
        
        .container {
            background-color: #fff;
            color: #000;
            padding: 0;
            border: 4px solid #000;
        }
        
        .header {
            background-color: #000;
            color: #fff;
            padding: 40px;
            text-align: center;
            border-bottom: 4px solid #000;
        }
        
        .header h1 {
            font-size: 3rem;
            margin: 0 0 10px 0;
            font-weight: bold;
            letter-spacing: 2px;
        }
        
        .header p {
            font-size: 1.1rem;
            margin: 10px 0 0 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .nav-bar {
            background-color: #000;
            border-bottom: 4px solid #000;
            padding: 0;
        }
        
        .nav-items {
            display: flex;
            justify-content: center;
            gap: 0;
        }
        
        .nav-item {
            background-color: #000;
            color: #fff;
            padding: 20px 40px;
            text-decoration: none;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.2s ease;
            border-right: 2px solid #fff;
        }
        
        .nav-item:last-child {
            border-right: none;
        }
        
        .nav-item:hover {
            background-color: #fff;
            color: #000;
        }
        
        .content {
            padding: 40px;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 0;
            margin-bottom: 60px;
            border: 2px solid #000;
        }
        
        .stat-item {
            background-color: #000;
            color: #fff;
            padding: 30px;
            text-align: center;
            border-right: 2px solid #000;
        }
        
        .stat-item:last-child {
            border-right: none;
        }
        
        .stat-number {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 10px;
            display: block;
        }
        
        .stat-label {
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .category {
            margin-bottom: 60px;
        }
        
        .category-title {
            font-size: 1.8rem;
            font-weight: bold;
            margin-bottom: 30px;
            padding: 20px;
            background-color: #000;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .sites-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
        }
        
        .site-card {
            border: 3px solid #000;
            padding: 0;
            background-color: #fff;
            transition: all 0.2s ease;
        }
        
        .site-card:hover {
            background-color: #000;
            color: #fff;
        }
        
        .site-card-header {
            background-color: #000;
            color: #fff;
            padding: 20px;
            border-bottom: 3px solid #000;
        }
        
        .site-card:hover .site-card-header {
            background-color: #fff;
            color: #000;
        }
        
        .site-card h3 {
            margin: 0;
            font-size: 1.3rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .site-card-body {
            padding: 25px;
        }
        
        .site-card p {
            margin-bottom: 25px;
            font-size: 0.95rem;
            line-height: 1.6;
        }
        
        .site-link {
            display: inline-block;
            background-color: #000;
            color: #fff;
            text-decoration: none;
            padding: 15px 25px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            border: 2px solid #000;
            transition: all 0.2s ease;
        }
        
        .site-card:hover .site-link {
            background-color: #fff;
            color: #000;
        }
        
        .site-link:hover {
            background-color: #000;
            color: #fff;
        }
        
        .status-active {
            color: #00ff00;
        }
        
        .status-inactive {
            color: #ff6666;
        }
        
        .status-development {
            color: #ffaa00;
        }
        
        .footer {
            text-align: center;
            margin-top: 60px;
            padding: 40px;
            border-top: 4px solid #000;
            background-color: #000;
            color: #fff;
        }
        
        .footer p {
            margin: 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .clickable-card {
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>THE ULMWEB</h1>
            <p>Complete Site Directory</p>
        </div>
        
        <div class="nav-bar">
            <div class="nav-items">
                <a href="index.html" class="nav-item">← Back to Main</a>
            </div>
        </div>
        
        <div class="content">
            <div class="category">
                <h2 class="category-title">Main Pages</h2>
                <div class="sites-grid">
"""

HTML_FOOTER = """
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Total Network Pages: {total_pages}</p>
            <p>Directory Status: Active</p>
            <p>Operator: Ulmer • 2025</p>
        </div>
    </div>
</body>
</html>
"""

# Template for each site card entry
SITE_CARD_TEMPLATE = """
                    <div class="site-card clickable-card" {onclick_action}>
                        <div class="site-card-header">
                            <h3>{page_title}</h3>
                        </div>
                        <div class="site-card-body">
                            <p>{page_description}</p>
                            <p><strong>Status:</strong> <span class="status-active">Active</span></p>
                            <a href="{file_name}" class="site-link" target="{target_attr}">{link_text}</a>
                        </div>
                    </div>
"""

def get_repo_files(owner, repo, token):
    """
    Fetches a list of files in the root of the GitHub repository using the GitHub API.
    Args:
        owner (str): The owner of the repository.
        repo (str): The name of the repository.
        token (str): GitHub Personal Access Token (can be None for public repos).
    Returns:
        list: A list of file information dictionaries.
    Raises:
        requests.exceptions.RequestException: If there's an HTTP error.
    """
    headers = {}
    if token:
        headers["Authorization"] = f"token {token}"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/"
    response = requests.get(url, headers=headers)
    response.raise_for_status() # Raise an exception for HTTP errors (e.g., 404, 401)
    return response.json()

def get_file_content(owner, repo, file_path, token):
    """
    Fetches the raw content of a file from the GitHub repository.
    Args:
        owner (str): The owner of the repository.
        repo (str): The name of the repository.
        file_path (str): The path to the file within the repository.
        token (str): GitHub Personal Access Token (can be None for public repos).
    Returns:
        str: The raw content of the file.
    Raises:
        requests.exceptions.RequestException: If there's an HTTP error.
    """
    headers = {}
    if token:
        headers["Authorization"] = f"token {token}"
    
    # Construct the raw URL for the file, assuming 'main' branch
    raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/{file_path}"
    response = requests.get(raw_url, headers=headers)
    response.raise_for_status()
    return response.text

def generate_directory_html():
    """
    Generates the complete HTML for the site directory based on GitHub repo files.
    It fetches HTML files, extracts their titles and descriptions, and formats them
    into the site directory structure.
    Returns:
        str: The complete HTML string for the directory page, or an error message.
    """
    site_cards_html = []
    total_pages = 0

    print("--- Starting HTML Directory Generation ---")
    try:
        print(f"Attempting to fetch files from: {GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}")
        files = get_repo_files(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN)
        print(f"Found {len(files)} items in the repository root.")

        html_files_found = 0
        for file_info in files:
            # Process only HTML files
            if file_info['type'] == 'file' and file_info['name'].endswith('.html'):
                html_files_found += 1
                file_name = file_info['name']
                print(f"Processing HTML file: {file_name}")
                
                # Default values for page information
                page_title = file_name.replace('.html', '').replace('-', ' ').title()
                page_description = "A page within the UlmWeb network."
                onclick_action = f"onclick=\"window.open('{file_name}', '_self')\""
                target_attr = '_self'
                link_text = "Visit Page"

                # --- Special handling for known pages to match user's original structure ---
                # These overrides ensure consistent titles, descriptions, and link behaviors
                # for specific pages you already have.
                if file_name == DIRECTORY_PAGE_FILENAME:
                    page_title = "The UlmWeb Directory"
                    page_description = "This page! Complete overview of all pages and projects within the UlmWeb ecosystem."
                    onclick_action = "" # No onclick for the current page itself
                    link_text = "Current Page"
                    target_attr = '_self' 
                elif file_name == "index.html":
                    page_title = "Homepage"
                    page_description = "Main landing page with website news and navigation hub. Your entry point to the UlmWeb network."
                elif file_name == "infinite-scroll-log.html":
                    page_title = "Infinite Log Stream"
                    page_description = "A procedurally generated log stream that extends infinitely as you scroll. Dive into endless data!"
                elif file_name == "ewige_tabelle.html":
                    page_title = "LFA Eternal Table"
                    page_description = "Lionsroarian Football Association all-time league table with complete club statistics and historical data."
                    target_attr = '_blank' # Open in a new tab as per your original code
                    onclick_action = f"onclick=\"window.open('{file_name}', '_blank')\""
                elif file_name == "terminal.html":
                    page_title = "Retro Terminal CLI"
                    page_description = "Experience an old-school command line interface. Type 'help' to explore commands and interact with the system!"
                
                # --- Attempt to extract title and description from the actual HTML file ---
                # This makes the script more intelligent for new, unknown HTML files.
                try:
                    print(f"Fetching content for {file_name}...")
                    html_content = get_file_content(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, file_name, GITHUB_TOKEN)
                    print(f"Successfully fetched content for {file_name}. Length: {len(html_content)} bytes.")
                    soup = BeautifulSoup(html_content, 'html.parser')
                    
                    # Extract title from <title> tag
                    if soup.title and soup.title.string:
                        page_title = soup.title.string.strip()
                    
                    # Extract description from meta tag or first paragraph
                    meta_description = soup.find('meta', attrs={'name': 'description'})
                    if meta_description and meta_description.get('content'):
                        page_description = meta_description['content'].strip()
                    else:
                        first_paragraph = soup.find('p')
                        if first_paragraph and first_paragraph.text.strip():
                            # Take a snippet of the first paragraph if it's too long
                            snippet = first_paragraph.text.strip()
                            page_description = snippet[:150] + "..." if len(snippet) > 150 else snippet

                except requests.exceptions.RequestException as e:
                    print(f"ERROR: Could not fetch content for {file_name} from GitHub. Using default title/description. Error: {e}")
                except Exception as e:
                    print(f"ERROR: Error parsing HTML for {file_name}. Using default title/description. Error: {e}")

                # Construct the site card HTML using the collected data
                card_html = SITE_CARD_TEMPLATE.format(
                    file_name=file_name,
                    page_title=page_title,
                    page_description=page_description,
                    onclick_action=onclick_action,
                    target_attr=target_attr,
                    link_text=link_text
                )
                site_cards_html.append(card_html)
                total_pages += 1
        
        print(f"Total HTML files processed: {html_files_found}")
        print(f"Generated {len(site_cards_html)} site cards.")
        
        full_html = HTML_HEADER + "\n".join(site_cards_html) + HTML_FOOTER.format(total_pages=total_pages)
        print("--- HTML Directory Generation Complete ---")
        return full_html

    except requests.exceptions.RequestException as e:
        error_msg = f"CRITICAL ERROR: Failed to fetch repository files: {e}. Please ensure the repository name/owner are correct, it's public, or your GITHUB_TOKEN environment variable is set correctly and has 'repo' or 'public_repo' access."
        print(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"CRITICAL ERROR: An unexpected error occurred during generation: {e}"
        print(error_msg)
        return error_msg

# Example of how to run this script locally:
if __name__ == "__main__":
    generated_html = generate_directory_html()
    print(generated_html)
