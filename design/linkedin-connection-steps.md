LinkedIn Connect Steps

1. if you dont have already , create a Page
2. head to linkedin developer platform https://www.linkedin.com/developers/apps
3. Create an App
4. Under Settings -> Add logo(mandatory) and privicy policy url
5. Under Auth -> See Client Id and Secret
6. See Oauth 2.0 scopes and see if you have required scope - w_member_social role
7. If not add it from products called Shared on LinkedIn
8. Then head to Oauth Tools https://www.linkedin.com/developers/tools/oauth
9. Create A token Member authorization code (3-legged)
10. Copy access token and use it in headers of postman and make api call for sharing on linked in to https://api.linkedin.com/v2/userinfo
11. copy sub": "Cpe7NMGZ90" value from the output
12. construct the LinkedIn Token settings in the form of
    AQWXC2OK9q\*\*\*\*|urn:li:person:Cpe7NMGZ90
    PS : without these steps you wont be able to publish posts to linkedin
13. Then copy the above constructed string and paste it in LINKEDIN ACCESS TOKEN field under System Settings & Defaults
14. Thats is you are all set to publish to linkedin

The role :w_member_social role allows the App and API call to
Create, modify, and delete posts, comments, and reactions on your behalf
