import Console from './PlatformConsole';
export const dynamic='force-dynamic';
export default function Platform(){
 const designReview=process.env.RAILWAY_ENVIRONMENT_NAME==='preview'&&process.env.PLATFORM_DESIGN_REVIEW_OPEN==='true';
 return <Console designReview={designReview}/>;
}
