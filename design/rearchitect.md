ok now we need to redesign this

1. remove references to aiweekly dev and replace with pubxstudio
2. improve the folder structure and path for publishing the content and mandatory hashtag generation for each platform
3. redesign the architecture for accomodating any LLM api key - make it generic
4. it whould dynamically load and work any of openai, gemini, claude - support only these these LLMs for now - Users supply their own key
5. improve content generation formatting to system prompt fo strictly output throughly checked , formatted content for each platform
6. make the app completely installable, runnable from user laptops and mobiles with one click
7. provide option for users to connect their accounts - linkedin, twitter, substack, website and provide a RAG status for each account if connected or not
8. Redesign or improve the entire workflow - if required build an Generic Agent for Content Generation and another Agent to pubslish to platforms with full Preview for Human in the Loop Verification with an Approved for Publication
9. Content Generation System Prompts should be any topic(not limited to Technical or AI) and also allow RAG context, user uploaded images/PDF/DOCS for content generation along with social media links and website links for RAG and generating content
10. Provide options for setting defaults for the workflow and allow easy changing of these defaults for each content
11. Allow users to define custom system prompts for content generation - provide a list of predefined templates for each platform
12. the app should be able to detect the LLM and if it supports Mixture of Experts then a separate agent should be invoked for image or video generation
13. The pubxstudio should be plugin based and allow easy addition of new feature
14. Under content section , add Research as a category with different color
    then for each Content Domain Category , add relative Topic/Title and dynamically change that when the user changes the Category
    Change the Content Domain Category order
    General
    Business Strategy
    Product Design
    Research
    Engineering & Code
    AI & ML

15. For each Content Domain Category , Ensure the system prompt should be different and optimized for that category and its loaded dynamically and we should provide an agent to ensure the content generated is optimized for that category
16. Content should be SEO friendly and we should provide options to optimize the content for SEO
17. implement version control for the PbxStudio App for next
18. implement functionality for Connectors grid so that the user can connect or disconnect each platform such as linkedin, twitter, substack, webflow/wordpress etc with status of connection, error count, last sync time.
19. Build a guided steps Markdown document to be accessed from the app anytime so that user can have seamless experience ,name this file as Guide and put it next to Settings and Keys
20. in the Guide Markdown - generate steps of how each connector should be configure and how each api key to be created in each platform and how to connect them to PbxStudio provide links and references under each platform . Also write a sample of how to generate and publish the content for one category and one platform end to end
21. for each LLM selection the available models should be pulled dynamically for the LLM from the cloud using LLM provider api. AS of now model keep changing daily and we do not know which model name is valid for long time. So the Orchestrator provider should dynamically load Target Model
22. Just below --> LLM Engine & System Prompt Customizer section and before Content Generation button, introduce checkboxes for all the platforms for the user to select publish to these selected platforms . So that the Content Generation Agent should only generate content selected by the user
23. Plan how to package PubxStudio as PWA and distribute to users as installable package with auto upate for mac, ios, windows, android . Plan the delivery model and hosting platform. I do not want to share entire code base . The user should also get notification updates when I push them , analyze which platform to use to scale this to users such as vercel or firebase or azure or anyother cdn
24. Each social media platform has post character limits set for free and premium plans. so the publishing app should check the limits and assume free limits for ech platform for example linkedin allows max 4000 characaters , similarly check for other platforms from external search and implement the limitation accordingly.
