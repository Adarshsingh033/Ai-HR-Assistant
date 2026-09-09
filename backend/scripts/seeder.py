import sys
import os
import asyncio
import uuid
import psycopg2
import psycopg2.extras

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import get_db_connection

def seed_database():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Truncate all tables except super_admin
            print("Cleaning up database...")
            cur.execute("TRUNCATE TABLE plans, admin, organization, branches, organization_members, candidates CASCADE;")
            
            # 2. Check if super_admin exists, if not, create one
            cur.execute("SELECT id FROM super_admin WHERE username = 'superadmin'")
            if not cur.fetchone():
                print("Creating default super admin...")
                cur.execute(
                    "INSERT INTO super_admin (id, username, email, password, full_name) VALUES (%s, %s, %s, %s, %s)",
                    (str(uuid.uuid4()), 'superadmin', 'superadmin@example.com', 'superadmin123', 'Super Admin')
                )
            
            # 3. Create 3 Plans
            print("Creating Plans...")
            plans = [
                (str(uuid.uuid4()), 'Basic', 'Basic Plan', 1, 1, 2, 'active'),
                (str(uuid.uuid4()), 'Standard', 'Standard Plan', 3, 3, 5, 'active'),
                (str(uuid.uuid4()), 'Premium', 'Premium Plan', 10, 10, 20, 'active'),
            ]
            for p in plans:
                cur.execute(
                    "INSERT INTO plans (id, name, description, max_organizations, max_branches, max_hr_users, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    p
                )
            
            # 4. Create 4 Admins
            print("Creating Admins...")
            admins_data = [
                ('Admin1', 'admin1@gmail.com', 'Admin@123', 'Admin One', plans[0][0]), # Basic
                ('Admin2', 'admin2@gmail.com', 'Admin@123', 'Admin Two', plans[1][0]), # Standard
                ('Admin3', 'admin3@gmail.com', 'Admin@123', 'Admin Three', plans[2][0]), # Premium
                ('Admin4', 'admin4@gmail.com', 'Admin@123', 'Admin Four', plans[2][0])  # Premium
            ]
            
            hr_counter = 1
            
            for ad in admins_data:
                admin_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO admin (id, username, email, password, full_name, plan_id, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (admin_id, ad[0], ad[1], ad[2], ad[3], ad[4], 'active')
                )
                
                # 5. Create multiple organizations for this admin
                # For basic plan max is 1, so we'll just create 1. For others we create 2.
                num_orgs = 1 if ad[0] == 'Admin1' else 2
                
                for o_idx in range(num_orgs):
                    org_id = str(uuid.uuid4())
                    company_name = f"Company {ad[0]} - {o_idx + 1}"
                    cur.execute(
                        "INSERT INTO organization (id, company_name, admin_id) VALUES (%s, %s, %s)",
                        (org_id, company_name, admin_id)
                    )
                    
                    # 6. Create branches in the organization
                    num_branches = 1
                    for b_idx in range(num_branches):
                        branch_id = str(uuid.uuid4())
                        branch_name = f"Branch {b_idx + 1} of {company_name}"
                        cur.execute(
                            "INSERT INTO branches (id, organization_id, created_by_admin_id, branch_name, branch_code) VALUES (%s, %s, %s, %s, %s)",
                            (branch_id, org_id, admin_id, branch_name, f"B{b_idx+1}-{ad[0]}-{o_idx+1}")
                        )
                        
                        # 7. Create 2 HRs per branch
                        for _ in range(2):
                            hr_username = f"hr{hr_counter}"
                            hr_email = f"hr{hr_counter}@gmail.com"
                            hr_pass = f"hr{hr_counter}@123"
                            cur.execute(
                                """INSERT INTO organization_members 
                                   (organization_id, branch_id, created_by_admin_id, full_name, username, email, password, phone, status) 
                                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                                (org_id, branch_id, admin_id, f"HR User {hr_counter}", hr_username, hr_email, hr_pass, f'9999{hr_counter:06d}', 'active')
                            )
                            hr_counter += 1

            conn.commit()
            print("Database seeded successfully!")

if __name__ == "__main__":
    seed_database()
