**Short answer:**  
LinkedIn is rejecting your post because you are using an **author URN of type `person`**, but the **UGC Post / Share API no longer allows posting as a person**. You must use a **member URN** (different from `person`) or an **organization/page URN** where the authenticated user has admin rights.

---

# ✅ **Why your request fails**

Your error:

```
author value urn:li:person:4a7114b8 is of type person.
Allowed URN types are company, member, organizationalPage
```

This tells us two critical things:

### **1. `urn:li:person:*` is NOT allowed anymore**

LinkedIn’s newer APIs (UGC Posts, Shares v2, etc.) **do not accept `person` URNs** as authors.  
They only accept:

- `urn:li:member:<id>`
- `urn:li:organization:<id>`
- `urn:li:organizationalPage:<id>`

This is consistent with LinkedIn’s URN rules and API behavior. [Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/urns)

### **2. Your OAuth token is returning a `person` URN**

When you call:

```
GET https://api.linkedin.com/v2/userinfo
```

You are likely receiving something like:

```
sub: "urn:li:person:4a7114b8"
```

This is **not** the URN you can use as `author`.

---

# ✅ **What LinkedIn actually expects**

To publish as a user, LinkedIn requires:

```
"author": "urn:li:member:<id>"
```

To publish as a company/page:

```
"author": "urn:li:organization:<id>"
```

---

# 🔍 **How to get the correct `member` URN**

Call:

```
GET https://api.linkedin.com/v2/me
```

This returns:

```json
{
  "id": "abcd1234",
  "localizedFirstName": "John",
  "localizedLastName": "Doe"
}
```

Then your author URN becomes:

```
urn:li:member:abcd1234
```

⚠️ **Do NOT use the `person` URN from `/userinfo`** — it is not valid for posting.

---

# 🔍 **If you want to post as a Company Page**

You must:

### **1. Get the list of organizations you can post to**

```
GET https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee
```

This returns the organizations where your user is an admin. [ayrshare.com](https://www.ayrshare.com/solutions/linkedin-403-unpermitted-access-urn-mismatches-permissions/)

### **2. Use the organization URN**

Example:

```
urn:li:organization:987654
```

---

# 🧪 **Checklist to fix your issue**

### **✔ Step 1 — Ensure your app has the correct permissions**

For personal posting:

- `w_member_social`

For company posting:

- `rw_organization_admin`
- AND your app must be approved for **Marketing Developer Platform (MDP)**

### **✔ Step 2 — Replace `urn:li:person:*` with `urn:li:member:*`**

Get it from:

```
GET /v2/me
```

### **✔ Step 3 — If posting to a company, verify admin rights**

Use:

```
GET /v2/organizationalEntityAcls?q=roleAssignee
```

### **✔ Step 4 — Use the correct author URN**

Examples:

| Scenario         | Correct URN                      |
| ---------------- | -------------------------------- |
| Post as yourself | `urn:li:member:<id>`             |
| Post as company  | `urn:li:organization:<id>`       |
| Post as page     | `urn:li:organizationalPage:<id>` |

---

curl GET https://api.linkedin.com/v2/userinfo
you get something called sub which is person id in URN
see below

AQWXC2OK9q_Jj88w6m5D5jL27nYz8SZlMAW3yDItjYqpe712xArdPH2XQag47LnV_3Svx7_KcqUWy6Iv6i-ZXwWWozDKLRPgoZ8S_n4vu2YKuTaMtkjP766S0MVk40PNp4ESWBwbr1bECexEU8kDtLRqtIi0F9wAfa8i5SPMkb7OyUGBlf3bRU8p85gy5dxuIAC1U1fBqQ_kufTNFeVEFrRnuYMRoFCZg8ay_WseATlm0TRfR_Jlq4Vrd4SCNFNyJp6jk3Y8vHsuWnmn00mgI5d9BJhFnwsR6NhDxLkyEmCRPZfLtsB78Kofd-UmCioEo-eQV4krKLTSazmSjI3yHc4PwC-lww|urn:li:person:Cpe7NMGT40
