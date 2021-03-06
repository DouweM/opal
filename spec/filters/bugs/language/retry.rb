opal_filter "retry" do
  fails "The retry statement re-executes the closest block"
  fails "The retry statement raises a SyntaxError when used outside of a begin statement"
  fails "The retry keyword inside a begin block's rescue block causes the begin block to be executed again"
end
