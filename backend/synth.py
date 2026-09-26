#!/usr/bin/env python3
"""Synthetic HackGT participant generator for ConnectNow.

Usage:
    python backend/synth.py --n 400 --seed 42 --out data/synthetic.json

No API key or network needed. Deterministic for a given seed.

Design: each participant is drawn from a latent "archetype" (ML researcher,
hardware hacker, quant, designer, ...). The archetype biases major, interests,
internship industries, and free-text answers, so real clusters emerge for the
similarity engine to find. It is stored as `latent_archetype` purely for
VALIDATING the clustering. Never use it as a model feature.
"""
import argparse
import json
import random
from collections import Counter
from pathlib import Path

# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------
SCHOOLS = {  # name: weight
    "Georgia Tech": 30, "Emory": 6, "UGA": 6, "Georgia State": 5, "Kennesaw State": 4,
    "SCAD": 2, "Spelman": 2, "Morehouse": 2, "Clemson": 3, "Auburn": 2, "Vanderbilt": 2,
    "UF": 3, "Duke": 2, "Purdue": 3, "UIUC": 3, "Michigan": 3, "Carnegie Mellon": 3,
    "MIT": 1, "Stanford": 1, "Waterloo": 2, "UNC Chapel Hill": 2, "Virginia Tech": 3,
    "NC State": 2, "Howard": 1, "Florida State": 1, "Alabama": 1, "Northeastern": 2,
    "Georgia Southern": 1, "Mercer": 1,
}

YEARS = {  # label: (weight, grad_year)
    "Freshman": (14, 2030), "Sophomore": (22, 2029), "Junior": (26, 2028),
    "Senior": (24, 2027), "Master's": (10, 2027), "PhD": (4, 2030),
}

INDUSTRIES = {
    "Big Tech": (["Google", "Microsoft", "Amazon", "Meta", "Apple", "NVIDIA", "Salesforce", "Adobe"],
                 ["Software Engineering Intern", "SWE Intern", "Explore Intern", "Research Intern"]),
    "Startup": (["Stripe", "Ramp", "Anduril", "Scale AI", "Notion", "Figma", "Vercel", "Retool", "Mercury"],
                ["Software Engineering Intern", "Founding Engineer Intern", "Product Intern"]),
    "Finance": (["Goldman Sachs", "Jane Street", "Citadel", "Two Sigma", "Bloomberg", "Capital One",
                 "JPMorgan", "Morgan Stanley", "Truist"],
                ["Quantitative Research Intern", "Software Engineering Intern", "Strategy Analyst Intern"]),
    "Defense/Aerospace": (["Lockheed Martin", "Northrop Grumman", "Boeing", "SpaceX", "Raytheon", "Blue Origin"],
                          ["Systems Engineering Intern", "Embedded Software Intern", "Avionics Intern"]),
    "Healthcare/Biotech": (["Emory Healthcare", "CDC", "Illumina", "Moderna", "Epic Systems", "Philips",
                            "Children's Healthcare of Atlanta"],
                           ["Data Science Intern", "Research Intern", "Bioinformatics Intern"]),
    "Hardware/Semis": (["Intel", "Qualcomm", "Texas Instruments", "Analog Devices", "Tesla", "Rivian",
                        "Bosch", "Apple Hardware"],
                       ["Hardware Engineering Intern", "Firmware Intern", "Embedded Systems Intern"]),
    "Consulting": (["Deloitte", "McKinsey", "BCG", "Accenture", "Bain", "PwC"],
                   ["Technology Consulting Intern", "Analytics Intern", "Business Analyst Intern"]),
    "Security": (["CrowdStrike", "Palo Alto Networks", "Mandiant", "Cloudflare", "Okta", "NSA"],
                 ["Security Engineering Intern", "Red Team Intern", "Threat Research Intern"]),
    "Media/Games": (["Riot Games", "EA", "Netflix", "Spotify", "Disney", "Epic Games", "Roblox"],
                    ["Gameplay Engineer Intern", "Graphics Intern", "UX Design Intern"]),
    "Logistics/Retail": (["Delta", "UPS", "Home Depot", "Coca-Cola", "Chick-fil-A", "Cox Automotive",
                          "NCR Voyix", "Genuine Parts"],
                         ["Software Engineering Intern", "Data Analyst Intern", "IT Intern"]),
    "Climate/Energy": (["Southern Company", "Georgia Power", "Form Energy", "Rivian", "Sunrun", "Tesla Energy"],
                       ["Data Science Intern", "Energy Systems Intern", "Software Engineering Intern"]),
    "Research Lab": (["Georgia Tech Research Institute", "Oak Ridge National Lab", "MIT Lincoln Lab",
                      "Argonne National Lab", "Allen Institute for AI"],
                     ["Undergraduate Researcher", "Research Assistant", "Summer Research Fellow"]),
}

# Each archetype: majors, industry weights, interests, skills, build ideas, fav tech
ARCHETYPES = {
    "ml_research": dict(
        w=14, majors=["Computer Science", "Computer Science", "Mathematics", "Statistics", "Computational Media"],
        ind={"Big Tech": 4, "Research Lab": 4, "Startup": 2, "Healthcare/Biotech": 1},
        interests=["large language models", "diffusion models", "reinforcement learning", "computer vision",
                   "AI safety", "interpretability", "graph neural networks", "NLP", "generative AI", "embeddings"],
        skills=["PyTorch", "Python", "JAX", "CUDA", "scikit-learn", "Hugging Face"],
        ideas=["an agent that reads research papers and reproduces their results",
               "a model that explains its own predictions in plain English",
               "a tool that finds hidden structure in messy datasets"],
        tech=["PyTorch", "Hugging Face", "Weights & Biases", "JAX", "Jupyter"]),
    "fullstack": dict(
        w=16, majors=["Computer Science", "Computer Science", "Information Systems", "Computational Media", "Software Engineering"],
        ind={"Startup": 4, "Big Tech": 3, "Logistics/Retail": 2, "Consulting": 1, "Finance": 1},
        interests=["web apps", "developer tools", "product design", "open source", "SaaS", "APIs",
                   "real-time collaboration", "productivity tools", "accessibility"],
        skills=["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL", "Tailwind"],
        ideas=["a collaborative tool that makes group projects painless",
               "a dashboard that turns boring spreadsheets into stories",
               "a browser extension that saves people hours a week"],
        tech=["Next.js", "Supabase", "tRPC", "Vercel", "Tailwind"]),
    "hardware": dict(
        w=9, majors=["Electrical Engineering", "Computer Engineering", "Mechanical Engineering", "Computer Engineering"],
        ind={"Hardware/Semis": 5, "Defense/Aerospace": 3, "Research Lab": 1},
        interests=["embedded systems", "IoT", "PCB design", "FPGAs", "sensors", "wearables",
                   "signal processing", "drones", "low-power computing"],
        skills=["C", "C++", "Verilog", "Arduino", "Raspberry Pi", "KiCad"],
        ideas=["a wearable that monitors posture and nudges you in real time",
               "a sensor network that maps air quality across campus",
               "a low-cost device that makes everyday objects smart"],
        tech=["ESP32", "Raspberry Pi", "Arduino", "KiCad", "FreeRTOS"]),
    "robotics": dict(
        w=6, majors=["Computer Science", "Mechanical Engineering", "Aerospace Engineering", "Electrical Engineering"],
        ind={"Defense/Aerospace": 3, "Startup": 2, "Research Lab": 3, "Hardware/Semis": 1},
        interests=["robotics", "autonomous vehicles", "SLAM", "motion planning", "computer vision",
                   "control systems", "human-robot interaction", "swarm robotics"],
        skills=["ROS", "C++", "Python", "OpenCV", "MATLAB", "SolidWorks"],
        ideas=["a robot that navigates a crowded room without bumping anyone",
               "a drone swarm that coordinates without a central controller",
               "an assistive arm that learns from demonstration"],
        tech=["ROS 2", "OpenCV", "Gazebo", "PyBullet", "Jetson Nano"]),
    "security": dict(
        w=6, majors=["Computer Science", "Cybersecurity", "Computer Engineering", "Information Security"],
        ind={"Security": 5, "Big Tech": 2, "Defense/Aerospace": 2, "Finance": 1},
        interests=["cybersecurity", "CTFs", "reverse engineering", "cryptography", "privacy",
                   "malware analysis", "zero trust", "penetration testing"],
        skills=["Python", "Rust", "Ghidra", "Wireshark", "Burp Suite", "Linux"],
        ideas=["a tool that detects phishing before you click",
               "a privacy layer that hides your data from trackers",
               "an automated auditor that finds vulnerabilities in student projects"],
        tech=["Rust", "Ghidra", "Kali Linux", "Docker", "Wireshark"]),
    "quant_fintech": dict(
        w=8, majors=["Mathematics", "Industrial Engineering", "Computer Science", "Applied Mathematics", "Economics"],
        ind={"Finance": 6, "Startup": 2, "Consulting": 1, "Big Tech": 1},
        interests=["quantitative trading", "fintech", "time series forecasting", "market microstructure",
                   "risk modeling", "probability", "options pricing", "payments"],
        skills=["Python", "C++", "R", "SQL", "pandas", "NumPy"],
        ideas=["a platform that makes personal investing explainable",
               "a real-time anomaly detector for payment fraud",
               "a simulator that stress-tests portfolios against weird scenarios"],
        tech=["pandas", "Polars", "kdb+", "Jupyter", "Rust"]),
    "bio_health": dict(
        w=7, majors=["Biomedical Engineering", "Computational Biology", "Biology", "Public Health", "Neuroscience"],
        ind={"Healthcare/Biotech": 6, "Research Lab": 3, "Startup": 1},
        interests=["healthtech", "genomics", "medical imaging", "drug discovery", "mental health",
                   "wearable health data", "bioinformatics", "neuroscience", "public health"],
        skills=["Python", "R", "Biopython", "SQL", "MATLAB", "TensorFlow"],
        ideas=["a triage tool that helps clinics prioritize patients",
               "an app that spots early warning signs in wearable data",
               "a pipeline that turns genomic data into plain-English insights"],
        tech=["Biopython", "Streamlit", "FHIR", "TensorFlow", "R Shiny"]),
    "games_graphics": dict(
        w=7, majors=["Computational Media", "Computer Science", "Digital Media", "Computer Science"],
        ind={"Media/Games": 5, "Big Tech": 2, "Startup": 2},
        interests=["game development", "computer graphics", "shaders", "procedural generation",
                   "AR/VR", "game AI", "creative coding", "interactive art", "physics simulation"],
        skills=["Unity", "Unreal Engine", "C#", "GLSL", "Three.js", "Blender"],
        ideas=["a game that teaches data structures through play",
               "a procedural world generator that never repeats",
               "an AR experience that turns campus into a living map"],
        tech=["Unity", "Three.js", "WebGL", "Blender", "Godot"]),
    "design_ux": dict(
        w=6, majors=["Industrial Design", "Human-Computer Interaction", "Computational Media", "Psychology", "Graphic Design"],
        ind={"Startup": 3, "Media/Games": 2, "Big Tech": 3, "Consulting": 1},
        interests=["UX research", "design systems", "accessibility", "data storytelling",
                   "motion design", "human-centered design", "prototyping", "information visualization"],
        skills=["Figma", "Framer", "Adobe Suite", "HTML/CSS", "User Research", "Prototyping"],
        ideas=["an interface that makes complex data feel obvious",
               "an onboarding flow so good people actually finish it",
               "a design tool that adapts to how you work"],
        tech=["Figma", "Framer", "D3.js", "Webflow", "Rive"]),
    "climate_social": dict(
        w=7, majors=["Environmental Engineering", "Public Policy", "Industrial Engineering", "Computer Science", "Economics"],
        ind={"Climate/Energy": 4, "Consulting": 2, "Research Lab": 2, "Startup": 2},
        interests=["climate tech", "sustainability", "energy grids", "civic tech", "education equity",
                   "food security", "disaster response", "open data", "urban planning"],
        skills=["Python", "GIS", "Tableau", "SQL", "R", "Leaflet"],
        ideas=["a map that shows which neighborhoods are most at risk in a heat wave",
               "a tool that helps nonprofits find and use public data",
               "a marketplace that reduces food waste on campus"],
        tech=["QGIS", "Tableau", "Mapbox", "Streamlit", "PostGIS"]),
    "data_viz": dict(
        w=7, majors=["Computer Science", "Data Science", "Statistics", "Industrial Engineering", "Computational Media"],
        ind={"Consulting": 3, "Big Tech": 3, "Startup": 2, "Logistics/Retail": 2, "Finance": 1},
        interests=["data visualization", "analytics", "dashboards", "network analysis", "geospatial data",
                   "data journalism", "big data", "recommender systems", "data engineering"],
        skills=["D3.js", "Python", "SQL", "Tableau", "Spark", "dbt"],
        ideas=["a visualization that reveals patterns nobody noticed",
               "a tool that makes any dataset explorable by non-experts",
               "a live map of how ideas spread through a community"],
        tech=["D3.js", "Observable", "DuckDB", "Plotly", "Apache Spark"]),
    "mobile": dict(
        w=5, majors=["Computer Science", "Information Systems", "Computer Science"],
        ind={"Startup": 3, "Big Tech": 3, "Logistics/Retail": 2, "Media/Games": 1},
        interests=["mobile apps", "iOS development", "Android", "consumer apps", "social apps",
                   "location-based services", "fitness tech", "on-device ML"],
        skills=["Swift", "SwiftUI", "Kotlin", "Flutter", "React Native", "Firebase"],
        ideas=["an app that helps people meet new friends in real life",
               "a habit tracker that actually keeps you honest",
               "a campus app that connects students by shared interests"],
        tech=["SwiftUI", "Flutter", "Firebase", "Expo", "Core ML"]),
    "web3_systems": dict(
        w=4, majors=["Computer Science", "Computer Engineering", "Mathematics"],
        ind={"Startup": 3, "Finance": 2, "Big Tech": 2, "Security": 1},
        interests=["distributed systems", "blockchain", "smart contracts", "databases",
                   "compilers", "operating systems", "high-performance computing", "networking"],
        skills=["Rust", "Go", "Solidity", "C++", "Kubernetes", "gRPC"],
        ideas=["a peer-to-peer protocol that needs no central server",
               "a database that heals itself after failures",
               "a compiler pass that finds performance bugs automatically"],
        tech=["Rust", "Go", "Kubernetes", "Solidity", "eBPF"]),
}

FIRST = ["Aisha", "Aiden", "Amara", "Andre", "Anika", "Arjun", "Ava", "Ben", "Camila", "Carlos", "Chloe",
         "Daniel", "Deja", "Diego", "Elena", "Eli", "Emma", "Ethan", "Fatima", "Gabriel", "Hana", "Hassan",
         "Isabella", "Ivan", "Jada", "Jamal", "Jasmine", "Jin", "Jordan", "Kai", "Kavya", "Kwame", "Leah",
         "Liam", "Lina", "Luca", "Maya", "Marcus", "Mei", "Mateo", "Nadia", "Nia", "Noah", "Olivia", "Omar",
         "Priya", "Quinn", "Rafael", "Riya", "Rohan", "Sara", "Sofia", "Sam", "Tariq", "Tessa", "Theo",
         "Uma", "Victor", "Wei", "Xavier", "Yara", "Yusuf", "Zainab", "Zoe", "Devon", "Imani", "Naveen",
         "Kenji", "Lucia", "Malik", "Nora", "Owen", "Paloma", "Ravi", "Selena", "Tyler", "Vivian"]
LAST = ["Patel", "Nguyen", "Kim", "Johnson", "Williams", "Garcia", "Martinez", "Chen", "Singh", "Ali",
        "Brown", "Davis", "Lopez", "Wilson", "Anderson", "Thomas", "Jackson", "Lee", "Harris", "Clark",
        "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Green", "Baker",
        "Adams", "Nelson", "Hill", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips", "Evans",
        "Turner", "Torres", "Parker", "Collins", "Edwards", "Stewart", "Morris", "Murphy", "Cook",
        "Rogers", "Morgan", "Cooper", "Reed", "Bailey", "Bell", "Okafor", "Reddy", "Shah", "Khan",
        "Tanaka", "Park", "Cho", "Mensah", "Rivera", "Silva", "Costa", "Ibrahim", "Sharma", "Gupta"]

FUN_FACTS = [
    "I once fixed my roommate's laptop with a paperclip and questionable confidence.",
    "I've visited 14 national parks and want to hit all 63.",
    "I can solve a Rubik's cube in under a minute.",
    "I make terrible puns and I'm proud of it.",
    "I brew my own kombucha and it has, so far, not poisoned anyone.",
    "I played varsity tennis in high school.",
    "I speak three languages and dream in whichever one is convenient.",
    "I've never finished a side project, but this weekend might change that.",
    "I run a tiny Etsy shop making stickers.",
    "I DJ at parties on weekends.",
    "I'm trying to visit every coffee shop in Atlanta.",
    "I've been in a band since middle school.",
    "I once won a hot sauce eating contest.",
    "I collect mechanical keyboards. It's a problem.",
    "I climbed Kilimanjaro last summer.",
    "I learned to code by modding Minecraft.",
    "I'm a competitive Smash player.",
    "I bake sourdough and name every loaf.",
    "I do stand-up comedy at open mics.",
    "I can recite the entire periodic table to a song.",
]

REASONS = ["because it lets me move fast", "because the ecosystem is unbeatable", "because it just feels right",
           "because I can prototype in an afternoon", "because I've been using it for years",
           "because the community is amazing"]

INTRO_TEMPLATES = [
    "Right now I'm really into {a}, {b}, and a bit of {c}.",
    "Mostly {a} and {b}. Lately I've been going down the {c} rabbit hole.",
    "I get excited about {a}. I also care a lot about {b} and {c}.",
    "{a}, {b}, {c}. Those are the things I lose sleep over (in a good way).",
]
BUILD_TEMPLATES = [
    "I want to build {idea}.",
    "This weekend I'm hoping we build {idea}.",
    "My dream project is {idea}.",
]
TECH_TEMPLATES = [
    "{t1} and {t2}, {reason}.",
    "Definitely {t1}. I also love {t2}, {reason}.",
    "{t1}, hands down. {t2} is a close second.",
]

QUESTIONS = {
    "interests": "What topics or technologies are you most excited about?",
    "build": "What do you want to build this weekend?",
    "fav_tech": "What's your favorite tool or technology, and why?",
    "fun_fact": "Tell us a fun fact about yourself.",
}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def wchoice(rng, weights: dict):
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


def make_internships(rng, arch, year_label):
    ranges = {"Freshman": (0, 1), "Sophomore": (0, 2), "Junior": (1, 3),
              "Senior": (1, 3), "Master's": (1, 3), "PhD": (1, 3)}
    lo, hi = ranges[year_label]
    n = rng.randint(lo, hi)
    if year_label == "Freshman" and rng.random() < 0.7:
        n = 0
    first_year = {"Freshman": 2026, "Sophomore": 2025, "Junior": 2024, "Senior": 2023,
                  "Master's": 2024, "PhD": 2022}[year_label]
    result, used = [], set()
    for i in range(n):
        ind = wchoice(rng, arch["ind"]) if rng.random() < 0.85 else rng.choice(list(INDUSTRIES))
        companies, roles = INDUSTRIES[ind]
        company = rng.choice(companies)
        if company in used:
            continue
        used.add(company)
        result.append({"company": company, "role": rng.choice(roles), "industry": ind,
                       "year": min(2026, first_year + i)})
    return result


def make_answers(rng, arch):
    a, b, c = rng.sample(arch["interests"], 3)
    # cross-pollinate: 25% chance one interest comes from a different archetype
    if rng.random() < 0.25:
        other = rng.choice([v for v in ARCHETYPES.values() if v is not arch])
        c = rng.choice(other["interests"])
    t1, t2 = rng.sample(arch["tech"], 2)
    return {
        QUESTIONS["interests"]: rng.choice(INTRO_TEMPLATES).format(a=a, b=b, c=c),
        QUESTIONS["build"]: rng.choice(BUILD_TEMPLATES).format(idea=rng.choice(arch["ideas"])),
        QUESTIONS["fav_tech"]: rng.choice(TECH_TEMPLATES).format(t1=t1, t2=t2, reason=rng.choice(REASONS)),
        QUESTIONS["fun_fact"]: rng.choice(FUN_FACTS),
    }


def build_teams(rng, people):
    """Assign teams of 3-4. ~60% mixed skills, ~25% same-archetype, ~15% same-school."""
    pool = people[:]
    rng.shuffle(pool)
    teams, tid = [], 1
    while pool:
        size = min(rng.choice([3, 4, 4, 4]), len(pool))
        seed = pool.pop()
        team = [seed]
        style = rng.random()
        for _ in range(size - 1):
            if not pool:
                break
            if style < 0.25:
                cand = [p for p in pool if p["latent_archetype"] == seed["latent_archetype"]]
            elif style < 0.40:
                cand = [p for p in pool if p["school"] == seed["school"]]
            else:
                cand = pool
            pick = rng.choice(cand or pool)
            pool.remove(pick)
            team.append(pick)
        for p in team:
            p["team_id"] = f"team-{tid:03d}"
        teams.append(team)
        tid += 1
    # fold an undersized final team (<3) into another team so all teams are 3-5
    if len(teams) > 1 and len(teams[-1]) < 3:
        small = teams.pop()
        target = teams[rng.randrange(len(teams))]
        for p in small:
            p["team_id"] = target[0]["team_id"]
        target.extend(small)
    for t in teams:
        ids = [p["id"] for p in t]
        for p in t:
            p["teammates"] = [i for i in ids if i != p["id"]]
    return teams


def build_friends(rng, people):
    """Realistic social graph: teammates, same-school, same-interest, plus random weak ties."""
    by_id = {p["id"]: p for p in people}
    by_school, by_arch = {}, {}
    for p in people:
        by_school.setdefault(p["school"], []).append(p["id"])
        by_arch.setdefault(p["latent_archetype"], []).append(p["id"])
    adj = {p["id"]: set() for p in people}

    def link(a, b):
        if a != b:
            adj[a].add(b)
            adj[b].add(a)

    for p in people:
        for t in p["teammates"]:
            if rng.random() < 0.85:
                link(p["id"], t)
        for _ in range(rng.randint(2, 8)):
            r = rng.random()
            if r < 0.50:
                pool = by_school[p["school"]]
            elif r < 0.80:
                pool = by_arch[p["latent_archetype"]]
            else:
                pool = list(by_id)
            link(p["id"], rng.choice(pool))
    # a handful of "connectors" who know lots of people across clusters
    for cid in rng.sample(list(by_id), max(3, len(people) // 40)):
        for other in rng.sample(list(by_id), min(len(people) - 1, rng.randint(15, 30))):
            link(cid, other)
    for p in people:
        p["friends"] = sorted(adj[p["id"]])


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def generate(n, seed):
    rng = random.Random(seed)
    used_names, people = set(), []
    arch_names = list(ARCHETYPES)
    arch_weights = [ARCHETYPES[k]["w"] for k in arch_names]
    year_labels = list(YEARS)
    year_weights = [YEARS[k][0] for k in year_labels]

    for i in range(n):
        while True:
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if name not in used_names:
                used_names.add(name)
                break
        arch_key = rng.choices(arch_names, weights=arch_weights, k=1)[0]
        arch = ARCHETYPES[arch_key]
        year = rng.choices(year_labels, weights=year_weights, k=1)[0]
        school = wchoice(rng, SCHOOLS)
        first, last = name.lower().split()
        people.append({
            "id": f"p{i:04d}",
            "name": name,
            "email": f"{first}.{last}{i}@example.com",
            "school": school,
            "major": rng.choice(arch["majors"]),
            "year": year,
            "grad_year": YEARS[year][1],
            "gpa_band": rng.choices(["<3.0", "3.0-3.4", "3.5-3.79", "3.8+"], weights=[3, 20, 40, 37])[0],
            "internships": make_internships(rng, arch, year),
            "skills": rng.sample(arch["skills"], rng.randint(3, 5)),
            "answers": make_answers(rng, arch),
            "team_id": None,
            "teammates": [],
            "friends": [],
            "is_synthetic": True,
            "latent_archetype": arch_key,   # ground truth for validation only, NOT a feature
        })
    build_teams(rng, people)
    build_friends(rng, people)
    return people


def main():
    ap = argparse.ArgumentParser(description="Generate synthetic HackGT participants")
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "synthetic.json"))
    args = ap.parse_args()

    people = generate(args.n, args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"questions": QUESTIONS, "participants": people}, indent=2))

    deg = [len(p["friends"]) for p in people]
    print(f"Wrote {len(people)} participants to {out}")
    print("Schools :", dict(Counter(p["school"] for p in people).most_common(5)), "...")
    print("Archetypes:", dict(Counter(p["latent_archetype"] for p in people).most_common(4)), "...")
    print(f"Teams   : {len({p['team_id'] for p in people})}")
    print(f"Friends : avg {sum(deg)/len(deg):.1f}, max {max(deg)}")
    print(f"Internships: avg {sum(len(p['internships']) for p in people)/len(people):.2f}")


if __name__ == "__main__":
    main()
